/*
  # Auto Process Pending Fleets

  1. New Function
    - `process_user_pending_fleets`: Processes all fleets for a user where arrival/return time has passed
    - Called from frontend when loading fleet data
    
  2. Changes
    - Loops through all incomplete fleets
    - Calls process_fleet_arrival for each overdue fleet
    - Returns count of processed fleets
*/

CREATE OR REPLACE FUNCTION process_user_pending_fleets(p_user_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
BEGIN
  FOR v_fleet IN 
    SELECT id, arrival_time, return_time, is_returning
    FROM fleets 
    WHERE user_id = p_user_id 
      AND is_completed = false
      AND (
        (NOT is_returning AND arrival_time <= NOW())
        OR (is_returning AND return_time <= NOW())
      )
    ORDER BY 
      CASE WHEN is_returning THEN return_time ELSE arrival_time END ASC
  LOOP
    PERFORM process_fleet_arrival(v_fleet.id);
    v_processed_count := v_processed_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION process_user_pending_fleets(uuid) TO authenticated;
