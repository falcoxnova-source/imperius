-- Fix: "Recoger Todo" en la fortaleza fallaba con
--   23505 duplicate key ... "fleet_ships_fleet_id_ship_type_id_key"
--
-- CAUSA RAIZ:
--   fortress_ships guarda UNA FILA POR DESPLIEGUE (diseno FIFO). Si un usuario
--   desplego el mismo tipo de nave en dos momentos distintos, tiene 2+ filas del
--   mismo ship_type_id. get_fortress_info.ships_detail agrupaba SOLO por user_id,
--   asi que devolvia el mismo ship_type_id repetido. El boton "Recoger Todo" manda
--   ese array tal cual y recall_from_fortress hacia un INSERT en fleet_ships por
--   cada entrada -> violacion del UNIQUE (fleet_id, ship_type_id).
--
-- ADEMAS (bug latente de seguridad): recall_from_fortress validaba CADA entrada del
--   JSON contra el TOTAL disponible. Con [{8,23},{8,23}] ambas validaciones pasaban
--   y se intentaban retirar 46 naves teniendo 23. Hoy lo frenaba por casualidad el
--   UNIQUE; por eso el arreglo NO puede ser un simple ON CONFLICT sumando, o se
--   crearian naves de la nada. Se corrige agregando el JSON ANTES de validar.

BEGIN;

-- 1) get_fortress_info: ships_detail agregado por (user_id, ship_type_id)
CREATE OR REPLACE FUNCTION public.get_fortress_info(p_galaxy integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fortress record;
  v_ships jsonb;
  v_contributors jsonb;
BEGIN
  SELECT af.*, a.name AS alliance_name, a.tag AS alliance_tag
  INTO v_fortress
  FROM alliance_fortresses af
  LEFT JOIN alliances a ON a.id = af.owner_alliance_id
  WHERE af.galaxy = p_galaxy;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada');
  END IF;

  -- Naves por tipo (total)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'ship_type_id', fs.ship_type_id,
    'ship_name', st.name,
    'total_quantity', fs.total_qty
  ) ORDER BY fs.total_qty DESC), '[]'::jsonb)
  INTO v_ships
  FROM (
    SELECT ship_type_id, SUM(quantity) AS total_qty
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id AND alliance_id = v_fortress.owner_alliance_id
    GROUP BY ship_type_id
  ) fs
  LEFT JOIN ship_types st ON st.id = fs.ship_type_id;

  -- Contribuidores con detalle por usuario.
  -- IMPORTANTE: se agrupa tambien por ship_type_id para no repetir el mismo tipo
  -- de nave cuando esta repartido en varias filas de fortress_ships.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', fc.user_id,
    'username', p.username,
    'total_ships', fc.total_qty,
    'ships_detail', fc.ships_detail
  ) ORDER BY fc.total_qty DESC), '[]'::jsonb)
  INTO v_contributors
  FROM (
    SELECT
      agg.user_id,
      SUM(agg.qty) AS total_qty,
      COALESCE(jsonb_agg(jsonb_build_object(
        'ship_type_id', agg.ship_type_id,
        'ship_name', st2.name,
        'quantity', agg.qty
      ) ORDER BY agg.qty DESC), '[]'::jsonb) AS ships_detail
    FROM (
      SELECT fs2.user_id, fs2.ship_type_id, SUM(fs2.quantity) AS qty
      FROM fortress_ships fs2
      WHERE fs2.fortress_id = v_fortress.id
        AND fs2.alliance_id = v_fortress.owner_alliance_id
        AND fs2.ship_type_id IS NOT NULL
      GROUP BY fs2.user_id, fs2.ship_type_id
    ) agg
    LEFT JOIN ship_types st2 ON st2.id = agg.ship_type_id
    GROUP BY agg.user_id
  ) fc
  LEFT JOIN profiles p ON p.id = fc.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'fortress_id', v_fortress.id,
    'galaxy', v_fortress.galaxy,
    'system', v_fortress.system,
    'position', v_fortress.position,
    'owner_alliance_id', v_fortress.owner_alliance_id,
    'owner_alliance_name', v_fortress.alliance_name,
    'owner_alliance_tag', v_fortress.alliance_tag,
    'captured_at', v_fortress.captured_at,
    'ships', v_ships,
    'total_ships', (SELECT COALESCE(SUM(quantity), 0) FROM fortress_ships WHERE fortress_id = v_fortress.id AND alliance_id = v_fortress.owner_alliance_id),
    'contributors', v_contributors
  );
END;
$function$;


-- 2) recall_from_fortress: tolerante a entradas duplicadas y a llamadas concurrentes
CREATE OR REPLACE FUNCTION public.recall_from_fortress(p_galaxy integer, p_ships jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fortress record;
  v_main_planet record;
  v_ship record;
  v_existing integer;
  v_remaining integer;      -- cantidad pendiente por retirar (retiro FIFO)
  v_row record;             -- fila individual de fortress_ships
  v_new_fleet_id uuid;
  v_distance int;
  v_slowest_speed int;
  v_flight_time int;
  v_speed_percent int;
  v_ships_norm jsonb;       -- p_ships agregado por ship_type_id
BEGIN
  -- Usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Serializa los retiros del mismo usuario: evita que un doble clic (o dos
  -- pestanas) ejecute dos retiros a la vez y duplique naves. Se libera solo
  -- al terminar la transaccion.
  PERFORM pg_advisory_xact_lock(hashtext('fortress_recall'), hashtext(v_user_id::text));

  -- Normalizar la peticion: descartar entradas invalidas y SUMAR las repetidas.
  -- Sin esto, el mismo ship_type_id enviado dos veces rompia el UNIQUE de
  -- fleet_ships y burlaba la validacion de cantidad disponible.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'ship_type_id', s.ship_type_id,
           'quantity', s.qty
         )), '[]'::jsonb)
  INTO v_ships_norm
  FROM (
    SELECT x.ship_type_id, SUM(x.quantity)::int AS qty
    FROM jsonb_to_recordset(COALESCE(p_ships, '[]'::jsonb))
         AS x(ship_type_id integer, quantity integer)
    WHERE x.ship_type_id IS NOT NULL
      AND x.quantity IS NOT NULL
      AND x.quantity > 0
    GROUP BY x.ship_type_id
  ) s;

  IF jsonb_array_length(v_ships_norm) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay naves para retirar');
  END IF;

  -- Obtener planeta principal (con coordenadas)
  SELECT id, galaxy, solar_system, position INTO v_main_planet
  FROM planets
  WHERE user_id = v_user_id AND is_main_planet = true
  LIMIT 1;

  IF v_main_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes planeta principal');
  END IF;

  -- Obtener fortaleza
  SELECT * INTO v_fortress
  FROM alliance_fortresses
  WHERE galaxy = p_galaxy;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fortaleza no encontrada');
  END IF;

  -- Validar que el usuario tiene suficientes naves propias en la fortaleza
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(v_ships_norm) AS x(ship_type_id integer, quantity integer)
  LOOP
    SELECT COALESCE(SUM(quantity), 0) INTO v_existing
    FROM fortress_ships
    WHERE fortress_id = v_fortress.id
      AND user_id = v_user_id
      AND ship_type_id = v_ship.ship_type_id;

    IF v_existing < v_ship.quantity THEN
      RETURN jsonb_build_object('success', false, 'error',
        'No tienes suficientes naves tipo ' || v_ship.ship_type_id || ' en la fortaleza');
    END IF;
  END LOOP;

  -- Calcular distancia: fortaleza (galaxia:250:8) -> planeta principal
  v_distance := fleet_calc_distance(
    p_galaxy, 250, 8,
    v_main_planet.galaxy, v_main_planet.solar_system, v_main_planet.position
  );

  -- Calcular velocidad de la nave mas lenta
  v_slowest_speed := fleet_calc_slowest_speed(v_ships_norm, v_user_id);

  IF v_slowest_speed <= 0 OR v_slowest_speed > 99999999 THEN
    v_slowest_speed := 5000; -- velocidad de reserva por defecto
  END IF;

  -- Porcentaje de velocidad de flota del universo (por defecto 100%)
  SELECT COALESCE((SELECT value::int FROM game_settings WHERE key = 'fleet_speed_percent'), 100)
  INTO v_speed_percent;

  -- Calcular tiempo de vuelo
  v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, v_speed_percent, 0);

  IF v_flight_time < 10 THEN
    v_flight_time := 10;
  END IF;

  -- Crear flota de regreso (viaja hacia el planeta principal)
  INSERT INTO fleets (
    user_id,
    origin_planet_id,
    target_galaxy,
    target_system,
    target_position,
    target_type,
    mission_type,
    departure_time,
    arrival_time,
    return_time,
    is_returning,
    is_completed
  ) VALUES (
    v_user_id,
    v_main_planet.id,
    v_main_planet.galaxy,
    v_main_planet.solar_system,
    v_main_planet.position,
    'planet',
    'deploy',
    now(),
    now() + (v_flight_time || ' seconds')::interval,
    now() + (v_flight_time || ' seconds')::interval,
    true,
    false
  )
  RETURNING id INTO v_new_fleet_id;

  -- Retirar naves de la fortaleza (FIFO por deployed_at) y ponerlas en la flota.
  -- Se descuenta fila por fila para no dejar nunca una cantidad negativa cuando
  -- el mismo tipo de nave esta repartido en varias filas.
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(v_ships_norm) AS x(ship_type_id integer, quantity integer)
  LOOP
    v_remaining := v_ship.quantity;

    FOR v_row IN
      SELECT id, quantity
      FROM fortress_ships
      WHERE fortress_id = v_fortress.id
        AND user_id = v_user_id
        AND ship_type_id = v_ship.ship_type_id
      ORDER BY deployed_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      IF v_row.quantity <= v_remaining THEN
        -- Consumir la fila completa
        DELETE FROM fortress_ships WHERE id = v_row.id;
        v_remaining := v_remaining - v_row.quantity;
      ELSE
        -- Consumir solo una parte de la fila
        UPDATE fortress_ships SET quantity = quantity - v_remaining WHERE id = v_row.id;
        v_remaining := 0;
      END IF;
    END LOOP;

    -- Red de seguridad: si no se pudo descontar todo lo pedido, se aborta TODO
    -- (rollback) en vez de meter en la flota naves que no salieron de la fortaleza.
    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Naves insuficientes en la fortaleza para el tipo % (faltan %)',
        v_ship.ship_type_id, v_remaining;
    END IF;

    -- Anadir a la flota de regreso. El ON CONFLICT es una red de seguridad extra:
    -- v_ships_norm ya viene sin tipos repetidos.
    INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
    VALUES (v_new_fleet_id, v_ship.ship_type_id, v_ship.quantity)
    ON CONFLICT (fleet_id, ship_type_id)
    DO UPDATE SET quantity = fleet_ships.quantity + EXCLUDED.quantity;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota de regreso creada. Llegara en ' || v_flight_time || ' segundos.',
    'fleet_id', v_new_fleet_id,
    'return_time', now() + (v_flight_time || ' seconds')::interval,
    'flight_seconds', v_flight_time
  );
END;
$function$;

COMMIT;
