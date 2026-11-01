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
  -- [FTORIG2] Retorno al planeta de origen
  v_acc jsonb := '{}'::jsonb;   -- "planeta|tipo_nave" => cantidad
  v_key text;
  v_dest record;
  v_dest_planet uuid;
  v_fleets int := 0;
  v_last_time int := 0;
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
  -- Porcentaje de velocidad de flota del universo (por defecto 100%)
  SELECT COALESCE((SELECT value::int FROM game_settings WHERE key = 'fleet_speed_percent'), 100)
  INTO v_speed_percent;

  -- [FTORIG2] La flota ya no se crea aqui: primero se averigua a que planeta
  -- vuelve cada nave y despues se crea una flota por cada destino.

  -- Retirar naves de la fortaleza (FIFO por deployed_at) y ponerlas en la flota.
  -- Se descuenta fila por fila para no dejar nunca una cantidad negativa cuando
  -- el mismo tipo de nave esta repartido en varias filas.
  FOR v_ship IN SELECT * FROM jsonb_to_recordset(v_ships_norm) AS x(ship_type_id integer, quantity integer)
  LOOP
    v_remaining := v_ship.quantity;

    FOR v_row IN
      SELECT id, quantity, origin_planet_id
      FROM fortress_ships
      WHERE fortress_id = v_fortress.id
        AND user_id = v_user_id
        AND ship_type_id = v_ship.ship_type_id
      ORDER BY deployed_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      -- [FTORIG2] Destino: el planeta desde el que salieron estas naves, siempre
      -- que siga siendo del jugador. Si no se conoce (despliegues antiguos) o ya
      -- no le pertenece, vuelven al planeta principal.
      v_dest_planet := NULL;
      IF v_row.origin_planet_id IS NOT NULL THEN
        SELECT p.id INTO v_dest_planet FROM planets p
        WHERE p.id = v_row.origin_planet_id AND p.user_id = v_user_id;
      END IF;
      IF v_dest_planet IS NULL THEN
        v_dest_planet := v_main_planet.id;
      END IF;
      v_key := v_dest_planet::text || '|' || v_ship.ship_type_id::text;

      IF v_row.quantity <= v_remaining THEN
        -- Consumir la fila completa
        DELETE FROM fortress_ships WHERE id = v_row.id;
        v_acc := jsonb_set(v_acc, ARRAY[v_key],
                   to_jsonb(COALESCE((v_acc->>v_key)::int, 0) + v_row.quantity));
        v_remaining := v_remaining - v_row.quantity;
      ELSE
        -- Consumir solo una parte de la fila
        UPDATE fortress_ships SET quantity = quantity - v_remaining WHERE id = v_row.id;
        v_acc := jsonb_set(v_acc, ARRAY[v_key],
                   to_jsonb(COALESCE((v_acc->>v_key)::int, 0) + v_remaining));
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
  END LOOP;

  -- [FTORIG2] Una flota de regreso por cada planeta de destino.
  FOR v_dest IN
    SELECT a.planet_id, p.galaxy, p.solar_system, p.position,
           jsonb_agg(jsonb_build_object('ship_type_id', a.ship_type_id, 'quantity', a.qty)) AS ships
    FROM (
      SELECT split_part(e.key, '|', 1)::uuid AS planet_id,
             split_part(e.key, '|', 2)::int  AS ship_type_id,
             e.value::int                      AS qty
      FROM jsonb_each_text(v_acc) e
    ) a
    JOIN planets p ON p.id = a.planet_id
    WHERE a.qty > 0
    GROUP BY a.planet_id, p.galaxy, p.solar_system, p.position
  LOOP
    v_distance := fleet_calc_distance(p_galaxy, 250, 8,
                                      v_dest.galaxy, v_dest.solar_system, v_dest.position);

    v_slowest_speed := fleet_calc_slowest_speed(v_dest.ships, v_user_id);
    IF v_slowest_speed <= 0 OR v_slowest_speed > 99999999 THEN
      v_slowest_speed := 5000;
    END IF;

    -- [FTSPD1] Mismos bonus de velocidad que secure_send_fleet (ida = vuelta).
    v_flight_time := fleet_calc_flight_time(v_distance, v_slowest_speed, v_speed_percent, CASE WHEN has_active_officer(v_user_id, 'admiral') THEN 0.2 ELSE 0 END);
    v_flight_time := GREATEST(10, FLOOR(v_flight_time / (1.0 + COALESCE(get_user_daily_mission_speed_bonus(v_user_id), 0))));
    IF is_user_plus(v_user_id) THEN
      v_flight_time := GREATEST(10, FLOOR(v_flight_time * 0.90));
    END IF;
    IF v_flight_time < 10 THEN
      v_flight_time := 10;
    END IF;
    IF v_flight_time > v_last_time THEN
      v_last_time := v_flight_time;
    END IF;

    INSERT INTO fleets (
      user_id, origin_planet_id, target_galaxy, target_system, target_position,
      target_type, mission_type, departure_time, arrival_time, return_time,
      is_returning, is_completed
    ) VALUES (
      v_user_id, v_dest.planet_id, v_dest.galaxy, v_dest.solar_system, v_dest.position,
      'planet', 'deploy', now(),
      now() + (v_flight_time || ' seconds')::interval,
      now() + (v_flight_time || ' seconds')::interval,
      true, false
    )
    RETURNING id INTO v_new_fleet_id;

    INSERT INTO fleet_ships (fleet_id, ship_type_id, quantity)
    SELECT v_new_fleet_id, (x->>'ship_type_id')::int, (x->>'quantity')::int
    FROM jsonb_array_elements(v_dest.ships) x
    ON CONFLICT (fleet_id, ship_type_id)
    DO UPDATE SET quantity = fleet_ships.quantity + EXCLUDED.quantity;

    v_fleets := v_fleets + 1;
  END LOOP;

  IF v_fleets = 0 THEN
    RAISE EXCEPTION 'No se pudo crear ninguna flota de regreso';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota de regreso creada. Llegara en ' || v_last_time || ' segundos.',
    'fleet_id', v_new_fleet_id,
    'return_fleets', v_fleets,
    'return_time', now() + (v_last_time || ' seconds')::interval,
    'flight_seconds', v_last_time
  );
END;
$function$

