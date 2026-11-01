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

  /* [FLOTAS v17/RESCATE] Red de seguridad: ninguna flota puede quedarse
     atascada para siempre. Si lleva mas de 15 minutos vencida y los bucles
     anteriores no han podido procesarla (por un error o porque un filtro la
     excluye), se reintenta aqui; si vuelve a fallar se devuelve al planeta de
     origen para que el jugador NO pierda sus naves ni su carga. */
  FOR v_fleet IN
    SELECT id
    FROM fleets
    WHERE is_completed = false
      AND NOT is_returning
      AND arrival_time <= NOW() - interval '15 minutes'
      -- [DEPOSITO ALIANZA] Las flotas estacionadas en el planeta de un aliado NO
      -- estan atascadas: estan defendiendo. No se rescatan ni se devuelven.
      AND NOT (
        mission_type = 'deploy'
        AND NOT (fleets.target_system = 250 AND fleets.target_position IN (8, 9))
        AND EXISTS (
          SELECT 1 FROM planets p
          WHERE p.galaxy = fleets.target_galaxy
            AND p.solar_system = fleets.target_system
            AND p.position = fleets.target_position
            AND p.planet_type = COALESCE(fleets.target_type, 'planet')
            AND p.user_id IS NOT NULL
            AND p.user_id <> fleets.user_id
        )
      )
    ORDER BY arrival_time ASC
    LIMIT 50
  LOOP
    BEGIN
      PERFORM process_fleet_arrival(v_fleet.id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        UPDATE fleets
           SET is_returning = true,
               return_time  = NOW() + GREATEST(interval '1 minute', (arrival_time - departure_time))
         WHERE id = v_fleet.id
           AND is_completed = false
           AND NOT is_returning;
        RAISE WARNING 'Fleet % devuelta a origen tras fallo repetido: %', v_fleet.id, SQLERRM;
      EXCEPTION WHEN OTHERS THEN
        v_error_count := v_error_count + 1;
      END;
    END;
  END LOOP;

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
$function$

