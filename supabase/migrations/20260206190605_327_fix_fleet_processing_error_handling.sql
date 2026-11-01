/*
  # Fix Fleet Processing Error Handling

  ## Problem
  The `process_user_pending_fleets` function (called by the frontend) had NO error
  handling. If one fleet processing failed (e.g., combat simulation error/timeout),
  ALL fleet processing for that user would fail. This caused:
  - Transport fleets not returning ships
  - Users seeing "lost" ships with no battle report
  - Fleets appearing stuck on the UI

  ## Solution
  - Add per-fleet error handling with EXCEPTION WHEN OTHERS
  - Each fleet is processed independently - one failure doesn't block others
  - Errors are tracked and reported in the response
*/

CREATE OR REPLACE FUNCTION public.process_user_pending_fleets(p_user_id uuid)
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
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE WARNING 'Error processing fleet % for user %: %', v_fleet.id, p_user_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count,
    'error_count', v_error_count
  );
END;
$function$;
