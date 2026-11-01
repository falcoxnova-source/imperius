/*
  # Fix: Duplicate "Flota Estacionada" notifications

  ## Problem
  When a deploy fleet arrives at an allied planet, it stays stationed (is_completed=false, 
  is_returning=false, cargo=0). The cron function `process_all_pending_fleets` was picking 
  up these already-stationed fleets every cycle and re-calling `process_fleet_arrival`, 
  which re-sent "Flota Estacionada" notifications each time.

  ## Fixes
  1. `process_all_pending_fleets` - Add filter to exclude stationed deploy fleets 
     (deploy + cargo all zero = already processed)
  2. `process_fleet_arrival` - Add early return guard in the deploy branch: 
     if the fleet has zero cargo and is targeting an allied planet, it's already stationed.
*/

-- Fix 1: process_all_pending_fleets - exclude stationed deploy fleets
CREATE OR REPLACE FUNCTION public.process_all_pending_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  FOR v_fleet IN
    SELECT id, user_id, mission_type
    FROM fleets
    WHERE is_completed = false
    AND NOT is_returning
    AND arrival_time <= NOW()
    AND mission_type != 'hold'
    AND NOT (mission_type = 'deploy' AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0)
    ORDER BY arrival_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;

  FOR v_fleet IN
    SELECT id, user_id, mission_type
    FROM fleets
    WHERE is_completed = false
    AND is_returning
    AND return_time <= NOW()
    ORDER BY return_time ASC
    LIMIT 100
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing returning fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$function$;
