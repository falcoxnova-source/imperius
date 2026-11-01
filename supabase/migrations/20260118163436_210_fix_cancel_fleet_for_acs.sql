/*
  # Fix Cancel Fleet for ACS Fleets

  ## Summary
  Updates the cancel_fleet function to properly handle ACS (Allied Combat System) fleets.
  When cancelling an ACS fleet, it removes the fleet from the ACS group before returning.

  ## Changes
  - Remove fleet from acs_participants when cancelling
  - Update acs_fleets current_participants count
  - If cancelling main fleet, cancel entire ACS
  - Clear ACS fields on the fleet record
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
  v_acs_record RECORD;
  v_is_main_fleet boolean;
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
  
  IF v_fleet.is_acs = true AND v_fleet.acs_id IS NOT NULL THEN
    SELECT * INTO v_acs_record
    FROM acs_fleets
    WHERE id = v_fleet.acs_id;
    
    IF v_acs_record IS NOT NULL THEN
      v_is_main_fleet := (v_acs_record.main_fleet_id = p_fleet_id);
      
      IF v_is_main_fleet THEN
        UPDATE fleets
        SET 
          is_acs = false,
          acs_id = NULL,
          acs_fleet_id = NULL
        WHERE acs_id = v_acs_record.id AND id != p_fleet_id;
        
        DELETE FROM acs_participants WHERE acs_id = v_acs_record.id;
        
        UPDATE acs_fleets
        SET is_active = false, status = 'cancelled'
        WHERE id = v_acs_record.id;
      ELSE
        DELETE FROM acs_participants 
        WHERE acs_id = v_fleet.acs_id AND fleet_id = p_fleet_id;
        
        UPDATE acs_fleets
        SET current_participants = GREATEST(0, current_participants - 1)
        WHERE id = v_fleet.acs_id;
      END IF;
    END IF;
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
    mission_type = 'return',
    is_acs = false,
    acs_id = NULL,
    acs_fleet_id = NULL
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
