/*
  Imperium: completar colas de construccion, astillero e investigacion en el
  servidor, para TODAS las colonias, aunque el jugador no las tenga
  seleccionadas o este desconectado.

  Problema: en imperium-db no habia ningun job de servidor para colas. Solo se
  completaban cuando el cliente llamaba process_completed_building_queue /
  process_completed_shipyard_queue / complete_research para el planeta
  SELECCIONADO, asi que las colonias no seleccionadas quedaban congeladas.

  Solucion: un job que reutiliza las MISMAS funciones del juego (sin cambiar
  logica de negocio): complete_building_queue_item, process_shipyard_queue_core
  y complete_research. Bloqueos SKIP LOCKED / FOR UPDATE de esas funciones
  evitan doble procesamiento con las llamadas del cliente.
*/
CREATE OR REPLACE FUNCTION public._cron_process_expired_queues()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_res jsonb;
  v_buildings integer := 0;
  v_shipyard integer := 0;
  v_research integer := 0;
  v_errors integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('_cron_process_expired_queues')) THEN
    RETURN jsonb_build_object('skipped', true);
  END IF;

  -- Construcciones (misma funcion que usa el cliente al completar)
  FOR r IN
    SELECT bq.id
    FROM building_queue bq
    WHERE bq.end_time IS NOT NULL AND bq.end_time <= NOW()
    ORDER BY bq.planet_id, bq.queue_position
    LIMIT 300
    FOR UPDATE OF bq SKIP LOCKED
  LOOP
    BEGIN
      v_res := public.complete_building_queue_item(r.id);
      IF COALESCE((v_res->>'success')::boolean, false) THEN
        v_buildings := v_buildings + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING '[QCRON] building %: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- Astillero / defensas (nucleo compartido con el cliente)
  FOR r IN
    SELECT DISTINCT sq.planet_id
    FROM shipyard_queue sq
    WHERE sq.queue_position = 1
      AND (sq.current_unit_end_time IS NULL OR sq.current_unit_end_time <= NOW())
    LIMIT 300
  LOOP
    BEGIN
      v_shipyard := v_shipyard + COALESCE(public.process_shipyard_queue_core(r.planet_id), 0);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING '[QCRON] shipyard %: %', r.planet_id, SQLERRM;
    END;
  END LOOP;

  -- Investigacion (incluye promocion de la siguiente en cola)
  FOR r IN
    SELECT DISTINCT ut.user_id
    FROM user_technologies ut
    WHERE ut.is_researching = true
      AND ut.research_end_time IS NOT NULL
      AND ut.research_end_time <= NOW()
    LIMIT 300
  LOOP
    BEGIN
      PERFORM public.complete_research(r.user_id);
      v_research := v_research + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      RAISE WARNING '[QCRON] research %: %', r.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'buildings', v_buildings,
    'shipyard_units', v_shipyard,
    'research_users', v_research,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public._cron_process_expired_queues() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('process-expired-queues', '30 seconds', 'SELECT public._cron_process_expired_queues()');
