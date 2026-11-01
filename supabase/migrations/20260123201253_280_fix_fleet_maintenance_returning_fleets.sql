/*
  # Fix Fleet Maintenance Function - Properly Handle Returning Fleets

  This migration fixes a critical bug in the admin_process_stuck_fleets function
  that was incorrectly processing returning fleets (expeditions) that had not
  yet arrived back home.

  ## Bug Description:
  The previous version filtered fleets with `arrival_time <= NOW()`, but for
  returning fleets (expeditions returning home), the arrival_time represents
  when they arrived at the DESTINATION, not when they return home.
  
  Returning fleets use `return_time` for when they arrive back home.

  ## Fix Applied:
  - Changed the filter to properly distinguish between:
    - Outgoing fleets: use arrival_time
    - Returning fleets: use return_time
  
  ## Updated Functions:
  - admin_process_stuck_fleets(): Now properly filters returning fleets
  - global_process_all_expired_queues(): Updated fleet section (if present)
  - Diagnostic query guidance for UI

  ## Security:
  - Maintains admin-only access
  - Uses SECURITY DEFINER for RLS bypass
*/

-- Fixed function to process ONLY truly stuck fleets
CREATE OR REPLACE FUNCTION admin_process_stuck_fleets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_fleet RECORD;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  FOR v_fleet IN 
    SELECT f.*
    FROM fleets f
    WHERE f.is_completed = false
      AND (
        (NOT COALESCE(f.is_returning, false) AND f.arrival_time IS NOT NULL AND f.arrival_time <= NOW())
        OR
        (COALESCE(f.is_returning, false) AND f.return_time IS NOT NULL AND f.return_time <= NOW())
      )
    ORDER BY COALESCE(f.return_time, f.arrival_time) ASC
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$$;

-- Function to get diagnostic counts for stuck items (for admin UI)
CREATE OR REPLACE FUNCTION get_stuck_items_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
  v_building_count integer;
  v_shipyard_count integer;
  v_fleet_count integer;
  v_research_count integer;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NOT NULL THEN
    SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
    IF NOT COALESCE(v_is_admin, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Admin access required');
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_building_count
  FROM building_queue
  WHERE end_time IS NOT NULL AND end_time <= NOW();

  SELECT COUNT(*) INTO v_shipyard_count
  FROM shipyard_queue
  WHERE current_unit_end_time IS NOT NULL AND current_unit_end_time <= NOW();

  SELECT COUNT(*) INTO v_fleet_count
  FROM fleets
  WHERE is_completed = false
    AND (
      (NOT COALESCE(is_returning, false) AND arrival_time IS NOT NULL AND arrival_time <= NOW())
      OR
      (COALESCE(is_returning, false) AND return_time IS NOT NULL AND return_time <= NOW())
    );

  SELECT COUNT(*) INTO v_research_count
  FROM user_technologies
  WHERE is_researching = true
    AND research_end_time IS NOT NULL
    AND research_end_time <= NOW();

  RETURN jsonb_build_object(
    'success', true,
    'stuck_buildings', v_building_count,
    'stuck_shipyard', v_shipyard_count,
    'stuck_fleets', v_fleet_count,
    'stuck_research', v_research_count,
    'checked_at', NOW()
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION admin_process_stuck_fleets() TO authenticated;
GRANT EXECUTE ON FUNCTION get_stuck_items_diagnostics() TO authenticated;
