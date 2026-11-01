CREATE OR REPLACE FUNCTION public.complete_building_queue_item(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '30s'
AS $function$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
  v_building_type building_types%ROWTYPE;
  v_fields_increase integer := 0;
  v_old_level integer;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_queue.end_time IS NULL OR v_queue.end_time > (NOW() + INTERVAL '2 seconds') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue.building_type_id;

  SELECT * INTO v_existing_building
  FROM planet_buildings
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    v_levels_added := v_queue.target_level - v_existing_building.level;
    v_old_level := v_existing_building.level;
    UPDATE planet_buildings
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    v_levels_added := v_queue.target_level;
    v_old_level := 0;
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
  END IF;

  IF v_building_type.code = 'lunar_base' THEN
    v_fields_increase := v_levels_added * 3;

    UPDATE planets
    SET
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSIF v_building_type.code = 'terraformer' THEN
    -- Exponencial: diferencia entre bonus del nuevo nivel y bonus del nivel anterior
    v_fields_increase := terraformer_field_bonus(v_queue.target_level) - terraformer_field_bonus(v_old_level);

    UPDATE planets
    SET
      fields_used = fields_used + v_levels_added,
      fields_max = fields_max + v_fields_increase
    WHERE id = v_queue.planet_id;
  ELSE
    IF v_levels_added > 0 THEN
      UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue.planet_id;
    END IF;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id
  )
  UPDATE building_queue bq
  SET
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 AND bq.start_time IS NULL THEN NOW() ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 AND bq.end_time IS NULL THEN NOW() + (bq.build_time || ' seconds')::interval ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object(
    'success', true,
    'building_type_id', v_queue.building_type_id,
    'new_level', v_queue.target_level,
    'fields_increase', v_fields_increase
  );
END;
$function$

