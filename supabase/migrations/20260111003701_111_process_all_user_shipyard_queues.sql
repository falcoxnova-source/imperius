/*
  # Add process_all_user_shipyard_queues function

  1. New Functions
    - `process_all_user_shipyard_queues()` - Processes shipyard queues for ALL planets owned by the user
    
  2. Purpose
    - Allows background processing of shipyard construction across all colonies
    - Ensures shipyard queues advance even when user is not viewing that planet
*/

CREATE OR REPLACE FUNCTION process_all_user_shipyard_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_planet RECORD;
  v_result jsonb;
  v_total_completed integer := 0;
  v_planet_completed integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  FOR v_planet IN 
    SELECT id FROM planets WHERE user_id = v_user_id
  LOOP
    SELECT * INTO v_result FROM process_completed_shipyard_queue(v_planet.id);
    
    IF (v_result->>'success')::boolean THEN
      v_planet_completed := COALESCE((v_result->>'completed_units')::integer, 0);
      v_total_completed := v_total_completed + v_planet_completed;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'completed_units', v_total_completed);
END;
$$;
