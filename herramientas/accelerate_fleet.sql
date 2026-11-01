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
  v_floor timestamptz;       -- momento minimo de llegada (10% del viaje)
  v_new_time timestamptz;    -- nueva llegada/regreso tras acelerar
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

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

  -- Solo se puede acelerar el 90% del viaje: una aceleracion por pierna
  IF NOT v_fleet.is_returning AND v_fleet.accel_out THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Esta flota ya fue acelerada. Solo se puede acelerar el 90% del viaje.');
  END IF;
  IF v_fleet.is_returning AND v_fleet.accel_ret THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Este regreso ya fue acelerado. Solo se puede acelerar el 90% del viaje.');
  END IF;

  v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);

  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
  END IF;

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

      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_defender_id,
        'Sistema de Defensa',
        'ALERTA: Flota hostil acelerada',
        'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') ||
        ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' ||
        v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
        E'\n\nPrepara tus defensas inmediatamente.',
        'combat'
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
      v_floor := v_fleet.arrival_time + (v_leg_duration * 0.10);
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
          return_time = v_new_time + COALESCE(v_fleet.return_time - v_fleet.arrival_time, interval '0'),
          accel_out = true
      WHERE id = p_fleet_id;
    ELSE
      v_floor := v_fleet.departure_time + (v_leg_duration * 0.10);
      v_new_time := GREATEST(now(), v_floor);
      UPDATE fleets
      SET arrival_time = v_new_time,
          -- preservar duracion de la pierna de vuelta (misma que la ida)
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
    'message', 'Flota acelerada (90% del viaje)',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount,
    'partial', true
  );
END;
$function$

