-- [FREEACCEL1] Aceleracion de flota gratis SOLO para la cuenta samaileal01@gmail.com
-- (profiles.id 7a209fdf-6067-45d6-97b6-020b76a06793). Resto de cuentas: sin cambios.
-- Se mantiene el calculo de coste (para saber si "esta a punto de llegar") pero no se cobra
-- ni se reparte comision.

CREATE OR REPLACE FUNCTION public.accelerate_fleet(p_fleet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_fleet fleets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_pool_pct numeric;
  v_jackpot_amount numeric;
  v_target_planet planets%ROWTYPE;
  v_defender_id uuid;
  v_origin_coords text;
  v_is_hostile boolean;
  v_leg_duration interval;   -- duracion total de la pierna actual (original)
  v_floor timestamptz;       -- momento minimo de llegada (segun VIP)
  v_new_time timestamptz;    -- nueva llegada/regreso tras acelerar
  v_is_vip boolean;          -- VIP acelera 100%, no-VIP 90%
  v_floor_factor numeric;    -- 0.00 VIP (100% acel) / 0.10 no-VIP (90% acel)
  v_accel_pct text;          -- texto informativo del % acelerado
  v_free boolean;            -- [FREEACCEL1]
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_free := v_user_id = '7a209fdf-6067-45d6-97b6-020b76a06793'::uuid;

  -- VIP: puede acelerar el 100% de la pierna (llega inmediato). Sin VIP: 90% (deja 10%).
  v_is_vip := is_user_plus(v_user_id);
  v_floor_factor := CASE WHEN v_is_vip THEN 0 ELSE 0.10 END;
  v_accel_pct := CASE WHEN v_is_vip THEN '100%' ELSE '90%' END;

  SELECT * INTO v_fleet
  FROM fleets
  WHERE id = p_fleet_id
  FOR UPDATE;

  IF v_fleet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
  END IF;

  IF v_fleet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
  END IF;

  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
  END IF;

  -- Solo se puede acelerar una vez por pierna (ida / regreso)
  IF NOT v_fleet.is_returning AND v_fleet.accel_out THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Esta flota ya fue acelerada. Solo se puede acelerar una vez por viaje.');
  END IF;
  IF v_fleet.is_returning AND v_fleet.accel_ret THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este regreso ya fue acelerado. Solo se puede acelerar una vez por viaje.');
  END IF;

  v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
  END IF;

  IF v_free THEN
    v_fxu_cost := 0;
    v_jackpot_amount := 0;
  ELSE
    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

    IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
      );
    END IF;

    PERFORM _internal_set_fxu_context();

    UPDATE profiles
    SET fxu_balance = fxu_balance - v_fxu_cost
    WHERE id = v_user_id;

    -- Reparto pool/empresa/referido del costo de aceleracion
    PERFORM distribute_spend_fee(v_fxu_cost, 'fleet_acceleration', 'fleet_acceleration', v_user_id,
      'Aceleracion de flota ' || v_fleet.mission_type ||
      CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END, NULL);

    -- Solo para el valor informativo de retorno
    SELECT COALESCE(value::numeric, 50) INTO v_pool_pct FROM game_settings WHERE key = 'spend_split_pool_share';
    v_jackpot_amount := FLOOR(v_fxu_cost * COALESCE(v_pool_pct, 50) / 100);
  END IF;

  v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;

  IF v_is_hostile THEN
    SELECT p.* INTO v_target_planet
    FROM planets p
    WHERE p.galaxy = v_fleet.target_galaxy
      AND p.solar_system = v_fleet.target_system
      AND p.position = v_fleet.target_position
    LIMIT 1;

    IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
      v_defender_id := v_target_planet.user_id;

      SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
      FROM planets p WHERE p.id = v_fleet.origin_planet_id;

      -- [ACCFIX1] messages NO tiene columna sender_name y 'combat' no es un
      -- message_type valido: este INSERT reventaba toda la aceleracion hostil.
      INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
      VALUES (
        v_defender_id,
        NULL,
        'ALERTA: Flota hostil acelerada',
        'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
        ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
        v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
        E'\n\nPrepara tus defensas inmediatamente.',
        'fleet_warning'
      );
    END IF;
  END IF;

  IF v_fleet.is_returning THEN
    -- Pierna de REGRESO: dejar el 10% del tiempo de vuelta
    v_leg_duration := v_fleet.return_time - v_fleet.arrival_time;
    IF v_leg_duration IS NULL OR v_leg_duration <= interval '0' THEN
      -- fallback defensivo: regreso inmediato
      v_new_time := now() - interval '1 second';
    ELSE
      -- [ACCFIX1] El suelo debe calcularse sobre el tiempo que REALMENTE queda.
      -- En flotas canceladas arrival_time puede quedar en el FUTURO y empujaba
      -- el regreso "acelerado" a un momento futuro (se quedaba a mitad).
      v_floor := LEAST(now(), v_fleet.arrival_time) + (v_leg_duration * v_floor_factor);
      v_new_time := GREATEST(now(), v_floor);
    END IF;

    UPDATE fleets
    SET return_time = v_new_time,
        accel_ret = true
    WHERE id = p_fleet_id;
  ELSE
    -- Pierna de IDA: dejar el 10% del tiempo de viaje
    v_leg_duration := v_fleet.arrival_time - v_fleet.departure_time;
    IF v_leg_duration IS NULL OR v_leg_duration <= interval '0' THEN
      -- fallback defensivo: llegada inmediata (comportamiento antiguo)
      v_new_time := now() - interval '1 second';
      UPDATE fleets
      SET arrival_time = v_new_time,
          -- [ACCFIX2] Acelerar la IDA NO acelera la VUELTA: se preserva la
          -- duracion original del regreso y accel_ret queda intacto.
          return_time = v_new_time + COALESCE(v_fleet.return_time - v_fleet.arrival_time, interval '0'),
          accel_out = true
      WHERE id = p_fleet_id;
    ELSE
      v_floor := v_fleet.departure_time + (v_leg_duration * v_floor_factor);
      v_new_time := GREATEST(now(), v_floor);
      UPDATE fleets
      SET arrival_time = v_new_time,
          -- [ACCFIX2] Acelerar la IDA NO acelera la VUELTA: se preserva la
          -- duracion de la pierna de vuelta y accel_ret queda intacto.
          return_time = v_new_time + v_leg_duration,
          accel_out = true
      WHERE id = p_fleet_id;
    END IF;
  END IF;

  -- process_fleet_arrival NO hace nada si la llegada/regreso sigue en el futuro
  -- (guardas internas: arrival_time > now / return_time > now -> RETURN),
  -- por eso no hay riesgo de duplicacion si aun falta el 10%.
  PERFORM process_fleet_arrival(p_fleet_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota acelerada (' || v_accel_pct || ' de esta pierna del viaje)',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount,
    'is_vip', v_is_vip,
    'partial', NOT v_is_vip
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.accelerate_acs(p_acs_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid;
  v_acs          record;
  v_f            record;
  v_fleet_count  integer := 0;
  v_fxu_cost     integer;
  v_current_fxu  numeric;
  v_pool_pct     numeric;
  v_jackpot      numeric;
  v_is_vip       boolean;
  v_floor_factor numeric;
  v_accel_pct    text;
  v_leg          interval;
  v_ret_leg      interval;
  v_cand         timestamptz;
  v_floor        timestamptz;
  v_new_time     timestamptz;
  v_target       record;
  v_origin_coords text;
  v_free         boolean;  -- [FREEACCEL1]
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  v_free := v_user_id = '7a209fdf-6067-45d6-97b6-020b76a06793'::uuid;

  SELECT * INTO v_acs FROM acs_fleets WHERE id = p_acs_id FOR UPDATE;

  IF v_acs IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ataque ACS no encontrado');
  END IF;

  IF v_acs.creator_id IS NULL OR v_acs.creator_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Solo el creador del ataque ACS puede acelerarlo');
  END IF;

  IF v_acs.is_active = false OR v_acs.status <> 'waiting' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este ataque ACS ya no esta activo');
  END IF;

  IF v_acs.arrival_time <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ataque ACS ya esta llegando');
  END IF;

  -- Una sola aceleracion por ACS
  IF EXISTS (
    SELECT 1 FROM acs_participants ap
    JOIN fleets f ON f.id = ap.fleet_id
    WHERE ap.acs_id = p_acs_id AND f.accel_out = true
  ) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este ataque ACS ya fue acelerado. Solo se puede acelerar una vez.');
  END IF;

  -- VIP del creador: 100% del viaje. Sin VIP: 90% (deja el 10%).
  v_is_vip       := is_user_plus(v_user_id);
  v_floor_factor := CASE WHEN v_is_vip THEN 0 ELSE 0.10 END;
  v_accel_pct    := CASE WHEN v_is_vip THEN '100%' ELSE '90%' END;

  -- Bloquear las flotas del ACS y calcular el suelo de llegada
  FOR v_f IN
    SELECT f.id, f.departure_time, f.arrival_time
    FROM acs_participants ap
    JOIN fleets f ON f.id = ap.fleet_id
    WHERE ap.acs_id = p_acs_id
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY f.id
    FOR UPDATE OF f
  LOOP
    v_fleet_count := v_fleet_count + 1;
    v_leg := v_f.arrival_time - v_f.departure_time;
    IF v_leg IS NOT NULL AND v_leg > interval '0' THEN
      v_cand := v_f.departure_time + (v_leg * v_floor_factor);
      IF v_floor IS NULL OR v_cand > v_floor THEN
        v_floor := v_cand;
      END IF;
    END IF;
  END LOOP;

  IF v_fleet_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este ataque ACS no tiene flotas en vuelo');
  END IF;

  v_fxu_cost := calculate_fxu_cost_acs(p_acs_id);
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ataque ACS esta a punto de llegar');
  END IF;

  IF v_free THEN
    v_fxu_cost := 0;
    v_jackpot := 0;
  ELSE
    SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;

    IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
      );
    END IF;

    PERFORM _internal_set_fxu_context();

    UPDATE profiles
    SET fxu_balance = fxu_balance - v_fxu_cost
    WHERE id = v_user_id;

    PERFORM distribute_spend_fee(v_fxu_cost, 'fleet_acceleration', 'fleet_acceleration', v_user_id,
      'Aceleracion de ataque ACS (' || v_fleet_count || ' flotas)', NULL);

    SELECT COALESCE(value::numeric, 50) INTO v_pool_pct FROM game_settings WHERE key = 'spend_split_pool_share';
    v_jackpot := FLOOR(v_fxu_cost * COALESCE(v_pool_pct, 50) / 100);
  END IF;

  v_new_time := GREATEST(now(), COALESCE(v_floor, now()));

  -- Aviso al defensor (una sola vez)
  SELECT p.* INTO v_target
  FROM planets p
  WHERE p.galaxy = v_acs.target_galaxy
    AND p.solar_system = v_acs.target_system
    AND p.position = v_acs.target_position
  LIMIT 1;

  IF v_target IS NOT NULL AND v_target.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM acs_participants ap WHERE ap.acs_id = p_acs_id AND ap.user_id = v_target.user_id) THEN

    SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
    FROM planets p
    WHERE p.id = (SELECT f.origin_planet_id FROM fleets f WHERE f.id = v_acs.main_fleet_id);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_target.user_id,
      NULL,  -- [ACCFIX1] antes 'Sistema de Defensa' en la columna inexistente sender_name
      'ALERTA: Ataque ACS acelerado',
      'Un ataque conjunto (ACS) de ' || v_fleet_count || ' flotas procedente de ' ||
      COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
      ' ha sido ACELERADO y llegara antes de lo previsto a tu planeta en [' ||
      v_acs.target_galaxy || ':' || v_acs.target_system || ':' || v_acs.target_position || '].' ||
      E'\n\nPrepara tus defensas inmediatamente.',
      'fleet_warning'
    );
  END IF;

  -- Reprogramar todas las flotas del ACS
  FOR v_f IN
    SELECT f.id, f.departure_time, f.arrival_time, f.return_time
    FROM acs_participants ap
    JOIN fleets f ON f.id = ap.fleet_id
    WHERE ap.acs_id = p_acs_id
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY f.id
  LOOP
    v_ret_leg := v_f.return_time - v_f.arrival_time;
    IF v_ret_leg IS NULL OR v_ret_leg <= interval '0' THEN
      v_ret_leg := v_f.arrival_time - v_f.departure_time;
    END IF;
    IF v_ret_leg IS NULL OR v_ret_leg < interval '0' THEN
      v_ret_leg := interval '0';
    END IF;

    UPDATE fleets
    SET arrival_time = v_new_time,
        return_time  = v_new_time + v_ret_leg,
        accel_out    = true
    WHERE id = v_f.id;
  END LOOP;

  UPDATE acs_fleets SET arrival_time = v_new_time WHERE id = p_acs_id;

  -- Procesar la llegada exactamente igual que hace el heartbeat de cada jugador.
  -- process_fleet_arrival no hace nada si la llegada sigue en el futuro (sin VIP).
  FOR v_f IN
    SELECT ap.fleet_id AS id
    FROM acs_participants ap
    JOIN fleets f ON f.id = ap.fleet_id
    WHERE ap.acs_id = p_acs_id
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY ap.joined_at
  LOOP
    PERFORM process_fleet_arrival(v_f.id);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Ataque ACS acelerado (' || v_accel_pct || ' del viaje, ' || v_fleet_count || ' flotas)',
    'fxu_spent', v_fxu_cost,
    'fleets', v_fleet_count,
    'jackpot_contribution', v_jackpot,
    'is_vip', v_is_vip,
    'partial', NOT v_is_vip
  );
END;
$function$;
