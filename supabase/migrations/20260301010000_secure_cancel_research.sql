/*
  # Cancel Research System

  1. New Function
    - `secure_cancel_research(p_technology_id uuid)`
      - Validates user owns the research and it is actively researching
      - Returns resources proportional to remaining time to the research planet
      - Resets is_researching, research_end_time, research_start_time, research_planet_id

  2. Security
    - Only authenticated users can cancel their own research
    - Server-side validation ensures research is actually in progress
    - Proportional refund based on time remaining (same pattern as building cancel)
*/

CREATE OR REPLACE FUNCTION secure_cancel_research(p_technology_id uuid)
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

  -- Calculate original cost (cost for the level being researched = current_level since it hasn't been upgraded yet)
  v_cost_metal := FLOOR(v_tech_type.base_metal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_crystal := FLOOR(v_tech_type.base_crystal * POWER(v_tech_type.cost_factor, v_current_level));
  v_cost_deuterium := FLOOR(v_tech_type.base_deuterium * POWER(v_tech_type.cost_factor, v_current_level));

  -- Calculate proportional refund based on remaining time
  IF v_tech.research_start_time IS NULL OR v_tech.research_end_time IS NULL THEN
    -- If no time info, refund 100%
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

  -- Reset research state
  UPDATE user_technologies
  SET
    is_researching = false,
    research_start_time = NULL,
    research_end_time = NULL,
    research_planet_id = NULL
  WHERE id = p_technology_id;

  -- Refund resources to the planet where research was happening
  UPDATE planet_resources
  SET
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = v_research_planet_id;

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

GRANT EXECUTE ON FUNCTION secure_cancel_research(uuid) TO authenticated;
