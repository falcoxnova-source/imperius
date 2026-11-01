/*
  # Global Fleet Processing System

  ## Summary
  This migration creates a system to process ALL pending fleets regardless of user connection status.
  
  ## Problem
  Fleets were getting stuck because `process_user_pending_fleets` only runs when a specific user
  is connected to the game. If a user sends a fleet and disconnects, the fleet stays stuck.
  
  ## Solution
  1. Create `process_all_pending_fleets` function that processes ALL users' fleets
  2. This can be called by:
     - Any user when they connect (processes all fleets)
     - An Edge Function cron job
     - Admin manually
  
  ## Changes
  - New function: `process_all_pending_fleets()` - processes all overdue fleets
  - This runs with SECURITY DEFINER to bypass RLS for processing

  ## Security
  - Function uses SECURITY DEFINER to process fleets regardless of caller
  - Does NOT expose fleet data, only processes arrivals
*/

-- Function to process ALL pending fleets for ALL users
CREATE OR REPLACE FUNCTION process_all_pending_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  -- Process all fleets that should have arrived (not returning)
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
    AND NOT is_returning
    AND arrival_time <= NOW()
    ORDER BY arrival_time ASC
    LIMIT 100  -- Process in batches to avoid timeout
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet %: %', v_fleet.id, SQLERRM;
    END;
  END LOOP;
  
  -- Process all fleets that should have returned
  FOR v_fleet IN 
    SELECT id, user_id, mission_type
    FROM fleets 
    WHERE is_completed = false
    AND is_returning
    AND return_time <= NOW()
    ORDER BY return_time ASC
    LIMIT 100  -- Process in batches to avoid timeout
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
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION process_all_pending_fleets() TO authenticated;
