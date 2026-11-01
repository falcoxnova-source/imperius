/*
  # Fix: Notificación "Flota Estacionada" repetida 100+ veces

  ## Problema
  `process_user_pending_fleets` (llamada por el frontend cada 5 segundos) NO excluía
  flotas deploy ya estacionadas (is_completed=false, is_returning=false, cargo=0/0/0).
  Cada ciclo re-procesaba la flota y enviaba otra notificación idéntica.

  ## Fix
  Añadir el mismo filtro que ya tiene `process_all_pending_fleets`:
  AND NOT (mission_type = 'deploy' AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0)
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
      (NOT is_returning AND arrival_time <= NOW()
        AND NOT (mission_type = 'deploy' AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0)
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
$function$;
