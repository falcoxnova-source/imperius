-- =====================================================================
-- FIX: complete_research no arranca la siguiente investigación en cola
--
-- Bug: La función complete_research (migración 041) sólo completaba la
--      investigación activa pero NO iniciaba la siguiente en research_queue.
--      Resultado: las investigaciones encoladas con el oficial Commander
--      se quedaban en cola y nunca comenzaban.
--
-- Fix: Reemplazar complete_research con la versión que, tras completar,
--      busca el siguiente item con status='queued' y lo arranca.
--      También se elimina la validación auth.uid() = p_user_id para que
--      el cron (que corre sin contexto de auth) pueda llamarla.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.complete_research(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tech   RECORD;
  v_next   RECORD;
  v_completed_count integer := 0;
  v_now    timestamptz;
  v_end    timestamptz;
BEGIN
  -- 1. Completar todas las investigaciones vencidas del usuario
  FOR v_tech IN
    SELECT ut.id, ut.level, ut.technology_type_id
    FROM user_technologies ut
    WHERE ut.user_id = p_user_id
      AND ut.is_researching = true
      AND ut.research_end_time <= now()
  LOOP
    UPDATE user_technologies
    SET level              = v_tech.level + 1,
        is_researching     = false,
        research_end_time  = NULL,
        research_planet_id = NULL
    WHERE id = v_tech.id;

    v_completed_count := v_completed_count + 1;
    PERFORM update_user_points(p_user_id);
  END LOOP;

  -- 2. Si no hay investigación activa, arrancar la siguiente en cola (Commander queue)
  IF NOT EXISTS (
    SELECT 1 FROM user_technologies
    WHERE user_id = p_user_id AND is_researching = true
  ) THEN
    SELECT * INTO v_next
    FROM research_queue
    WHERE user_id = p_user_id AND status = 'queued'
    ORDER BY queue_position ASC, created_at ASC
    LIMIT 1;

    IF FOUND THEN
      v_now := now();
      v_end := v_now + (v_next.research_time || ' seconds')::interval;

      ALTER TABLE user_technologies DISABLE TRIGGER trigger_research_points;

      INSERT INTO user_technologies (
        user_id, technology_type_id, level, is_researching,
        research_start_time, research_end_time, research_planet_id
      ) VALUES (
        p_user_id, v_next.technology_type_id, v_next.target_level - 1, true,
        v_now, v_end, v_next.planet_id
      )
      ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
        is_researching     = true,
        research_start_time = v_now,
        research_end_time  = v_end,
        research_planet_id = v_next.planet_id;

      ALTER TABLE user_technologies ENABLE TRIGGER trigger_research_points;

      -- Eliminar el item que acabamos de arrancar
      DELETE FROM research_queue WHERE id = v_next.id;

      -- Reindexar posiciones restantes
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
        FROM research_queue
        WHERE user_id = p_user_id AND status = 'queued'
      )
      UPDATE research_queue rq
      SET queue_position = ranked.new_pos
      FROM ranked
      WHERE rq.id = ranked.id;
    END IF;
  END IF;

  RETURN v_completed_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_research(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_research(uuid) TO service_role;
