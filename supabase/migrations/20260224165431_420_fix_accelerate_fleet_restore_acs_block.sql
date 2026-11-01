/*
  # Restore ACS block in accelerate_fleet function

  1. Problem
    - A later migration overwrote the accelerate_fleet function and removed the ACS fleet validation
    - ACS fleets could be accelerated via direct RPC calls bypassing the frontend check
    - The frontend blocks it in the UI but the backend must also enforce it

  2. Fix
    - Restore the `IF v_fleet.acs_id IS NOT NULL` check that was in migration 363
    - Keep the v_one_way_flight_interval logic for correct return_time calculation
    - No other changes to the function logic
*/

CREATE OR REPLACE FUNCTION accelerate_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fleet fleets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_jackpot_percent numeric;
  v_jackpot_amount numeric;
  v_revenue_amount numeric;
  v_target_planet planets%ROWTYPE;
  v_defender_id uuid;
  v_origin_coords text;
  v_is_hostile boolean;
  v_one_way_flight_interval interval;
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

  IF v_fleet.acs_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede acelerar flotas en ataque grupal (ACS)');
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

  SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
  FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';

  IF v_jackpot_percent < 0 THEN v_jackpot_percent := 0; END IF;
  IF v_jackpot_percent > 100 THEN v_jackpot_percent := 100; END IF;

  v_jackpot_amount := FLOOR(v_fxu_cost * v_jackpot_percent / 100);
  v_revenue_amount := v_fxu_cost - v_jackpot_amount;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles
  SET fxu_balance = fxu_balance - v_fxu_cost
  WHERE id = v_user_id;

  IF v_revenue_amount > 0 THEN
    INSERT INTO admin_revenue (revenue_type, amount, related_user_id, description)
    VALUES ('fleet_acceleration', v_revenue_amount, v_user_id,
      'Aceleracion de flota ' || v_fleet.mission_type ||
      CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'fleet_acceleration', v_user_id);
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
    UPDATE fleets
    SET return_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  ELSE
    v_one_way_flight_interval := v_fleet.arrival_time - v_fleet.departure_time;

    UPDATE fleets
    SET arrival_time = now() - interval '1 second',
        return_time = now() + v_one_way_flight_interval
    WHERE id = p_fleet_id;
  END IF;

  PERFORM process_fleet_arrival(p_fleet_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota acelerada exitosamente',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount
  );
END;
$$;
