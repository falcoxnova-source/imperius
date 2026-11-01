-- =====================================================================
-- FIX: Al cancelar investigación activa, arrancar siguiente en cola
--
-- Problema reportado:
-- - Con Commander, al cancelar la investigación actual,
--   la siguiente se quedaba en cola y no comenzaba.
--
-- Causa:
-- - secure_cancel_research() solo cancelaba y devolvía recursos,
--   pero no hacía "pop" de research_queue.
--
-- Solución:
-- - Después de cancelar, si no hay investigación activa,
--   iniciar automáticamente la primera entrada en cola.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.secure_cancel_research(p_technology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tech RECORD;
  v_tech_type RECORD;
  v_current_level integer;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_elapsed_seconds numeric;
  v_total_seconds numeric;
  v_remaining_percent numeric;
  v_refund_metal bigint;
  v_refund_crystal bigint;
  v_refund_deuterium bigint;
  v_research_planet_id uuid;
  v_next RECORD;
  v_now timestamptz;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the technology record
  SELECT * INTO v_tech
  FROM user_technologies
  WHERE id = p_technology_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology not found or not owned');
  END IF;

  IF NOT v_tech.is_researching THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology is not being researched');
  END IF;

  v_research_planet_id := v_tech.research_planet_id;
  IF v_research_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research planet not found');
  END IF;

  -- Get technology type for cost calculation
  SELECT * INTO v_tech_type FROM technology_types WHERE id = v_tech.technology_type_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Technology type not found');
  END IF;

  v_current_level := v_tech.level;

  -- Calculate original cost (cost for the level being researched = current_level)
  v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

  -- Calculate proportional refund based on remaining time
  IF v_tech.research_start_time IS NULL OR v_tech.research_end_time IS NULL THEN
    v_remaining_percent := 1.0;
  ELSE
    v_elapsed_seconds := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_tech.research_start_time)));
    v_total_seconds := EXTRACT(EPOCH FROM (v_tech.research_end_time - v_tech.research_start_time));

    IF v_total_seconds <= 0 OR v_elapsed_seconds >= v_total_seconds THEN
      v_remaining_percent := 0;
    ELSE
      v_remaining_percent := (v_total_seconds - v_elapsed_seconds) / v_total_seconds;
    END IF;
  END IF;

  v_refund_metal := FLOOR(v_cost_metal * v_remaining_percent);
  v_refund_crystal := FLOOR(v_cost_crystal * v_remaining_percent);
  v_refund_deuterium := FLOOR(v_cost_deuterium * v_remaining_percent);

  -- Reset current active research state
  UPDATE user_technologies
  SET
    is_researching = false,
    research_start_time = NULL,
    research_end_time = NULL,
    research_planet_id = NULL
  WHERE id = p_technology_id;

  -- Refund resources
  UPDATE planet_resources
  SET
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = v_research_planet_id;

  -- NEW: If user now has no active research, start first queued entry
  IF NOT EXISTS (
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid() AND is_researching = true
  ) THEN
    SELECT * INTO v_next
    FROM research_queue
    WHERE user_id = auth.uid()
      AND status IN ('queued', 'pending')
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
        auth.uid(), v_next.technology_type_id, v_next.target_level - 1, true,
        v_now, v_end, v_next.planet_id
      )
      ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
        is_researching = true,
        research_start_time = v_now,
        research_end_time = v_end,
        research_planet_id = v_next.planet_id;

      ALTER TABLE user_technologies ENABLE TRIGGER trigger_research_points;

      DELETE FROM research_queue WHERE id = v_next.id;

      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position ASC, created_at ASC) AS new_pos
        FROM research_queue
        WHERE user_id = auth.uid() AND status IN ('queued', 'pending')
      )
      UPDATE research_queue rq
      SET queue_position = ranked.new_pos
      FROM ranked
      WHERE rq.id = ranked.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'refund_metal', v_refund_metal,
    'refund_crystal', v_refund_crystal,
    'refund_deuterium', v_refund_deuterium,
    'refund_planet_id', v_research_planet_id,
    'remaining_percent', ROUND(v_remaining_percent * 100)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.secure_cancel_research(uuid) TO authenticated;
