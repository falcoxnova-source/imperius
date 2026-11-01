-- =====================================================================
-- FIX: la cola de investigacion (oficial Comandante) no avanza sola
--
-- CAUSA RAIZ (verificada en produccion 2026-08-10):
--   Hay 6+ caminos distintos que terminan una investigacion poniendo
--   user_technologies.is_researching = false:
--     optimized_global_queue_processor (CRON cada minuto)  <-- el real
--     complete_research, instant_complete_research,
--     admin_process_stuck_research, global_process_all_expired_queues,
--     full_reconnect_sync, full_reconnect_sync_all_planets,
--     process_all_user_queues_on_reconnect, bot_process_queues, ...
--   SOLO complete_research e instant_complete_research(uuid) promovian
--   la cola. El CRON, que es quien realmente cierra las investigaciones
--   (sobre todo con el jugador desconectado), hace un UPDATE plano:
--       UPDATE user_technologies
--       SET level = level + 1, is_researching = false, ...
--   y NUNCA llama a promote_next_queued_research().
--   Resultado: termina la #1 y las siguientes se quedan congeladas para
--   siempre, porque el frontend solo llama a complete_research cuando
--   HAY una investigacion activa a punto de vencer (App.tsx), y ya no
--   la hay. Caso real: Zandersqyes, 2 items en cola desde 2026-08-09.
--
-- SOLUCION (punto unico, sin duplicar logica):
--   1. Se endurece promote_next_queued_research (misma firma).
--   2. Se anade un TRIGGER en user_technologies que dispara cuando
--      is_researching pasa de true -> false. Cubre TODOS los caminos
--      actuales y futuros de una sola vez. Es a prueba de excepciones:
--      si la promocion fallase, jamas rompe el cierre de la
--      investigacion (solo deja un WARNING).
--   3. complete_research promueve siempre (auto-reparacion cuando el
--      jugador abre la pagina).
--   4. Reparacion puntual de las colas ya atascadas.
--
-- NO se toca: optimized_global_queue_processor, secure_start_research,
--   secure_cancel_queued_research, instant_complete_research, ni el
--   frontend. Modo vacaciones NO se ve afectado (pausa poniendo
--   research_end_time = NULL pero deja is_researching = true, asi que
--   el trigger no dispara y promote() ve investigacion activa).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Promotor endurecido (misma firma, mismo comportamiento externo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_next_queued_research(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_next    RECORD;
  v_now     timestamptz;
  v_end     timestamptz;
  v_planet  uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Solo puede haber UNA investigacion activa a la vez
  IF EXISTS (
    SELECT 1 FROM user_technologies
    WHERE user_id = p_user_id AND is_researching = true
  ) THEN
    RETURN false;
  END IF;

  -- En vacaciones no se arranca nada
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND COALESCE(vacation_mode, false) = true
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_next
  FROM research_queue
  WHERE user_id = p_user_id
    AND status IN ('queued', 'pending')
  ORDER BY queue_position ASC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- El planeta de la cola puede haber desaparecido (colonia abandonada,
  -- planeta destruido...). Se resuelve a uno valido del jugador.
  SELECT p.id INTO v_planet
  FROM planets p
  WHERE p.id = v_next.planet_id AND p.user_id = p_user_id;

  IF v_planet IS NULL THEN
    SELECT p.id INTO v_planet
    FROM planets p
    WHERE p.user_id = p_user_id
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  v_now := now();
  v_end := v_now + (GREATEST(1, v_next.research_time) || ' seconds')::interval;

  INSERT INTO user_technologies (
    user_id, technology_type_id, level, is_researching,
    research_start_time, research_end_time, research_planet_id
  ) VALUES (
    p_user_id, v_next.technology_type_id, GREATEST(0, v_next.target_level - 1), true,
    v_now, v_end, v_planet
  )
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching      = true,
    research_start_time = v_now,
    research_end_time   = v_end,
    research_planet_id  = v_planet;

  DELETE FROM research_queue WHERE id = v_next.id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
    FROM research_queue
    WHERE user_id = p_user_id AND status IN ('queued', 'pending')
  )
  UPDATE research_queue rq
  SET queue_position = ranked.new_pos
  FROM ranked
  WHERE rq.id = ranked.id;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.promote_next_queued_research(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_next_queued_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_next_queued_research(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 2. Trigger: cubre TODOS los caminos de finalizacion de una sola vez
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_promote_research_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Nunca puede romper el cierre de la investigacion: si la promocion
  -- falla por cualquier motivo, se registra y se sigue adelante.
  BEGIN
    IF EXISTS (
      SELECT 1 FROM research_queue
      WHERE user_id = NEW.user_id AND status IN ('queued', 'pending')
      LIMIT 1
    ) THEN
      PERFORM promote_next_queued_research(NEW.user_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'promote_research_queue fallo para %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_research_promote_next ON public.user_technologies;

CREATE TRIGGER trg_research_promote_next
AFTER UPDATE ON public.user_technologies
FOR EACH ROW
WHEN (OLD.is_researching = true AND COALESCE(NEW.is_researching, false) = false)
EXECUTE FUNCTION public.trg_promote_research_queue();

-- ---------------------------------------------------------------------
-- 3. complete_research: promover SIEMPRE (auto-reparacion)
--    Se mantiene RETURNS void (firma real en produccion).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_research(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  research_record RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only complete own research';
  END IF;

  FOR research_record IN
    SELECT id
    FROM user_technologies
    WHERE user_id = p_user_id
      AND is_researching = true
      AND research_end_time IS NOT NULL
      AND research_end_time <= NOW()
  LOOP
    -- El trigger trg_research_promote_next arranca la siguiente de la cola
    UPDATE user_technologies
    SET level              = level + 1,
        is_researching     = false,
        research_end_time  = NULL,
        research_planet_id = NULL
    WHERE id = research_record.id;
  END LOOP;

  -- Red de seguridad: si la cola quedo huerfana por un cierre antiguo
  -- (anterior a este fix) o por cualquier desincronizacion, se arranca.
  PERFORM promote_next_queued_research(p_user_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.complete_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_research(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Reparacion de las colas ya atascadas
-- ---------------------------------------------------------------------
DO $repair$
DECLARE
  v_user RECORD;
  v_fixed integer := 0;
BEGIN
  FOR v_user IN
    SELECT DISTINCT rq.user_id
    FROM research_queue rq
    WHERE rq.status IN ('queued', 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM user_technologies ut
        WHERE ut.user_id = rq.user_id AND ut.is_researching = true
      )
  LOOP
    IF promote_next_queued_research(v_user.user_id) THEN
      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Colas de investigacion desatascadas: %', v_fixed;
END
$repair$;

-- ---------------------------------------------------------------------
-- 5. Verificacion (aborta la transaccion si algo no quedo bien)
-- ---------------------------------------------------------------------
DO $chk$
DECLARE
  v_trg integer;
  v_stuck integer;
BEGIN
  SELECT COUNT(*) INTO v_trg
  FROM pg_trigger
  WHERE tgrelid = 'public.user_technologies'::regclass
    AND tgname = 'trg_research_promote_next'
    AND NOT tgisinternal;

  IF v_trg <> 1 THEN
    RAISE EXCEPTION 'El trigger trg_research_promote_next no quedo creado (%)', v_trg;
  END IF;

  -- Se excluyen los jugadores en vacaciones: ahi la cola SI debe esperar.
  SELECT COUNT(*) INTO v_stuck
  FROM research_queue rq
  JOIN profiles pr ON pr.id = rq.user_id
  WHERE rq.status IN ('queued', 'pending')
    AND COALESCE(pr.vacation_mode, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM user_technologies ut
      WHERE ut.user_id = rq.user_id AND ut.is_researching = true
    );

  IF v_stuck > 0 THEN
    RAISE EXCEPTION 'Quedan % filas en cola sin investigacion activa', v_stuck;
  END IF;

  RAISE NOTICE 'Verificacion OK: trigger activo y 0 colas atascadas.';
END
$chk$;

COMMIT;

NOTIFY pgrst, 'reload schema';
