/*
  # Cancel Fleet with Proportional Return Time

  ## Summary
  Allows players to cancel fleets in flight. The return time is proportional
  to how far the fleet has traveled - if it's halfway to destination, it takes
  half the original flight time to return.

  ## New Function
  - `cancel_fleet(p_fleet_id uuid)`: Cancels a fleet and sets proportional return time

  ## Logic
  - Can only cancel fleets that are not already returning
  - Can only cancel fleets that haven't arrived yet
  - Return time = time_elapsed (proportional to distance traveled)
  - Cargo is preserved and returns with the fleet

  ## Security
  - User can only cancel their own fleets
*/

CREATE OR REPLACE FUNCTION cancel_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fleet RECORD;
  v_now timestamptz;
  v_departure_time timestamptz;
  v_arrival_time timestamptz;
  v_total_flight_seconds numeric;
  v_elapsed_seconds numeric;
  v_progress_ratio numeric;
  v_return_seconds numeric;
  v_new_return_time timestamptz;
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
    RETURN jsonb_build_object('success', false, 'error', 'No puedes cancelar flotas de otros jugadores');
  END IF;
  
  IF v_fleet.is_returning = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya esta regresando');
  END IF;
  
  IF v_fleet.is_completed = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya completo su mision');
  END IF;
  
  v_now := now();
  v_departure_time := v_fleet.departure_time;
  v_arrival_time := v_fleet.arrival_time;
  
  IF v_now >= v_arrival_time THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya llego a su destino');
  END IF;
  
  v_total_flight_seconds := EXTRACT(EPOCH FROM (v_arrival_time - v_departure_time));
  v_elapsed_seconds := EXTRACT(EPOCH FROM (v_now - v_departure_time));
  
  IF v_total_flight_seconds <= 0 THEN
    v_progress_ratio := 0;
  ELSE
    v_progress_ratio := v_elapsed_seconds / v_total_flight_seconds;
  END IF;
  
  v_progress_ratio := GREATEST(0, LEAST(1, v_progress_ratio));
  
  v_return_seconds := v_elapsed_seconds;
  
  IF v_return_seconds < 10 THEN
    v_return_seconds := 10;
  END IF;
  
  v_new_return_time := v_now + (v_return_seconds || ' seconds')::interval;
  
  UPDATE fleets
  SET 
    is_returning = true,
    arrival_time = v_now,
    return_time = v_new_return_time,
    mission_type = 'return'
  WHERE id = p_fleet_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota cancelada. Regresara en ' || CEIL(v_return_seconds) || ' segundos',
    'return_seconds', CEIL(v_return_seconds),
    'progress_percent', ROUND(v_progress_ratio * 100)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cancelar flota: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_fleet(uuid) TO authenticated;
