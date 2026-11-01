-- ============================================================================
-- FIX: los refuerzos (deploy) enviados al Planeta del Tesoro (sistema 250,
-- posicion 9) nunca se procesaban.
--
-- Causa raiz:
--   process_all_pending_fleets() y process_user_pending_fleets() excluyen del
--   procesamiento las misiones 'deploy' sin carga cuyo destino no sea un
--   planeta propio del jugador (para que las flotas "estacionadas" no se
--   consuman). Esa exclusion tenia una excepcion SOLO para la Fortaleza
--   (250:8), pero no para el Planeta del Tesoro (250:9), y en
--   process_user_pending_fleets no existia ninguna excepcion.
--
--   Resultado: la flota llegaba a [g:250:9], quedaba para siempre como
--   "Estacionada / Defendiendo" en la pagina de Flotas y sus naves nunca se
--   sumaban a la guarnicion del Planeta del Tesoro.
--
-- Arreglo:
--   Tratar 250:9 igual que 250:8 en ambas funciones. process_fleet_arrival()
--   ya contiene la logica correcta (inserta en treasure_planet_ships, vacia
--   fleet_ships, marca la flota is_completed = true y envia el mensaje
--   "Refuerzo Enviado"); solo hacia falta que la flota llegara a procesarse.
--
-- No se cambia nada mas. Misma firma en ambas funciones -> no hace falta
-- recargar el esquema de PostgREST.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_all_pending_fleets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
DECLARE
  v_fleet record;
  v_processed_count integer := 0;
  v_error_count integer := 0;
BEGIN
  -- Outgoing fleets that have arrived at their target
  FOR v_fleet IN
    SELECT id
    FROM fleets
    WHERE is_completed = false
    AND NOT is_returning
    AND arrival_time <= NOW()
    AND mission_type != 'hold'
    -- ACS attack fleets are resolved as a group by the ACS processor below,
    -- never individually.
    AND COALESCE(is_acs, false) = false
    AND NOT (
      mission_type = 'deploy'
      AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0
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

  -- Resolve any coordinated (ACS) attacks whose arrival time has passed.
  -- This runs the combined combat and sends the ACS battle reports.
  BEGIN
    PERFORM check_pending_acs_attacks();
  EXCEPTION WHEN OTHERS THEN
    v_error_count := v_error_count + 1;
    RAISE WARNING 'Error processing pending ACS attacks: %', SQLERRM;
  END;

  -- Returning fleets (including ACS survivors returning home)
  FOR v_fleet IN
    SELECT id
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
$fn$;

CREATE OR REPLACE FUNCTION public.process_user_pending_fleets(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn$
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
        AND NOT (
          mission_type = 'deploy' 
          AND cargo_metal = 0 AND cargo_crystal = 0 AND cargo_deuterium = 0
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
$fn$;
