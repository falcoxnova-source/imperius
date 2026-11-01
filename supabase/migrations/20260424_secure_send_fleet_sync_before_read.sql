-- =============================================================================
-- Fix: secure_send_fleet falla con "Insufficient metal/crystal/deuterium for cargo"
-- teniendo recursos de sobra en pantalla.
--
-- Causa: la función lee planet_resources directamente, pero planet_resources
--        es un snapshot que solo se refresca cuando alguien llama a
--        sync_planet_resources(). El frontend suele llamarla antes de abrir el
--        panel de flotas, pero si falla (ERR_CONNECTION_CLOSED, lag, reintento
--        del pooler), la RPC termina leyendo valores viejos y rechaza el envío
--        aunque la producción ya haya generado los recursos.
--
-- Fix:
--   1) PERFORM sync_planet_resources(p_origin_planet_id) al inicio, antes de
--      leer v_resources. Garantiza valores frescos dentro de la transacción.
--   2) FOR UPDATE en el SELECT para bloquear la fila y evitar dos envíos
--      concurrentes del mismo planeta quitando el mismo metal dos veces.
--
-- NO afecta a:
--   - bot_ai_tick() (Fase H transporte de bots/autopilot): no usa esta RPC.
--   - send_fleet (legacy): migración separada si se quiere.
--   - cron de producción: sync_planet_resources ya es la función oficial.
-- =============================================================================

DO $migration$
DECLARE
  v_src text;
  v_new text;
  v_old text := 'SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id;';
  v_patch text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
    FROM pg_proc
   WHERE proname = 'secure_send_fleet'
   LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'secure_send_fleet no existe';
  END IF;

  IF position(v_old IN v_src) = 0 THEN
    RAISE NOTICE 'El patrón a reemplazar ya no existe (posiblemente ya parcheado). Abortando sin cambios.';
    RETURN;
  END IF;

  v_patch :=
    '-- [PATCH 20260424] refrescar recursos antes de validar cargo' || chr(10) ||
    '  PERFORM sync_planet_resources(p_origin_planet_id);' || chr(10) ||
    '  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_origin_planet_id FOR UPDATE;';

  v_new := replace(v_src, v_old, v_patch);

  EXECUTE v_new;

  RAISE NOTICE 'secure_send_fleet parcheado: ahora llama a sync_planet_resources y bloquea FOR UPDATE antes de validar el cargo.';
END;
$migration$;
