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

  -- [SECFIX6] SEC005: impide operar en nombre de otra cuenta
  IF current_setting('role', true) IN ('authenticated', 'anon')
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado: solo puedes operar sobre tu propia cuenta. Code: SEC005'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_fleet IN
    SELECT id, arrival_time, return_time, is_returning
    FROM fleets
    WHERE user_id = p_user_id
    AND is_completed = false
    AND (
      (NOT is_returning AND arrival_time <= NOW()
        AND NOT (
          mission_type = 'deploy' 
          -- [DEPOSITO ALIANZA] sin filtro de carga: TODO deploy a un planeta ajeno
          -- (que no sea 250:8 / 250:9) queda estacionado y no debe reprocesarse.
          -- fortress (250:8) and treasure planet (250:9) deploys must still be processed
          AND NOT (fleets.target_system = 250 AND fleets.target_position IN (8, 9))
          AND NOT EXISTS (
            SELECT 1 FROM planets p 
            WHERE p.user_id = fleets.user_id 
            AND p.galaxy = fleets.target_galaxy 
            AND p.solar_system = fleets.target_system 
            AND p.position = fleets.target_position
          )
        )
      )
      OR (is_returning AND return_time <= NOW())
    )
    ORDER BY
      CASE WHEN is_returning THEN return_time ELSE arrival_time END ASC
    FOR UPDATE SKIP LOCKED
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
$function$

