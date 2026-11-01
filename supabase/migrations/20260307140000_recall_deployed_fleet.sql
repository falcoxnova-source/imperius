/*
  # Recall deployed fleet from allied planet

  ## Problem
  Once a fleet arrives at an allied planet via deploy (alliance depot),
  the owner cannot recall it back home. cancel_fleet rejects it with
  "La flota ya llego a su destino" because arrival_time <= now().

  ## Fix
  New function recall_deployed_fleet(p_fleet_id uuid) that:
  1. Validates ownership and that fleet is deployed (mission_type = 'deploy',
     not completed, not already returning, arrival_time <= now())
  2. Calculates return time = same flight duration as the original trip
  3. Sets is_returning = true with the computed return_time
  4. The existing is_returning handler in process_fleet_arrival will
     return the ships + cargo to the origin planet on arrival

  ## Safety
  - New function only, no existing functions modified
  - No table/column changes
  - GRANT to authenticated role (same pattern as cancel_fleet)
*/

CREATE OR REPLACE FUNCTION recall_deployed_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fleet RECORD;
  v_now timestamptz;
  v_original_flight_seconds numeric;
  v_return_time timestamptz;
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
    RETURN jsonb_build_object('success', false, 'error', 'No puedes retirar flotas de otros jugadores');
  END IF;

  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya completo su mision');
  END IF;

  IF v_fleet.is_returning THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya esta regresando');
  END IF;

  IF v_fleet.mission_type != 'deploy' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo se pueden retirar flotas en mision de estacionamiento');
  END IF;

  v_now := now();

  -- Fleet must have already arrived (i.e. it's stationed, not in transit)
  IF v_fleet.arrival_time > v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota aun no ha llegado. Usa cancelar flota en su lugar');
  END IF;

  -- Calculate return time = same duration as original flight
  v_original_flight_seconds := EXTRACT(EPOCH FROM (v_fleet.arrival_time - v_fleet.departure_time));
  IF v_original_flight_seconds < 10 THEN
    v_original_flight_seconds := 10;
  END IF;

  v_return_time := v_now + (v_original_flight_seconds || ' seconds')::interval;

  UPDATE fleets
  SET is_returning = true,
      arrival_time = v_now,
      return_time = v_return_time
  WHERE id = p_fleet_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota retirada. Regresara en ' || CEIL(v_original_flight_seconds) || ' segundos',
    'return_seconds', CEIL(v_original_flight_seconds)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al retirar flota: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION recall_deployed_fleet(uuid) TO authenticated;
