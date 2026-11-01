/*
  # Fix Building Queue Completion to Recalculate Times

  ## Problem
  When a building queue item moves to position 1, it uses the stored build_time
  which may be incorrect if it was calculated before speed fixes were applied.

  ## Solution
  Recalculate build_time when an item becomes first in queue using current game speed.
*/

CREATE OR REPLACE FUNCTION complete_building_queue_item(p_queue_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue building_queue%ROWTYPE;
  v_planet planets%ROWTYPE;
  v_existing_building planet_buildings%ROWTYPE;
  v_next_item RECORD;
  v_robotics_level integer;
  v_nanite_level integer;
  v_correct_build_time integer;
  v_game_speed integer;
BEGIN
  SELECT * INTO v_queue FROM building_queue WHERE id = p_queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = v_queue.planet_id;
  IF NOT FOUND OR v_planet.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_queue.end_time IS NULL OR v_queue.end_time > NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Build not complete yet');
  END IF;

  SELECT * INTO v_existing_building 
  FROM planet_buildings 
  WHERE planet_id = v_queue.planet_id AND building_type_id = v_queue.building_type_id;

  IF FOUND THEN
    UPDATE planet_buildings 
    SET level = v_queue.target_level, is_upgrading = false, upgrade_end_time = NULL
    WHERE id = v_existing_building.id;
  ELSE
    INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
    VALUES (v_queue.planet_id, v_queue.building_type_id, v_queue.target_level, false);
    
    UPDATE planets SET fields_used = fields_used + 1 WHERE id = v_queue.planet_id;
  END IF;

  DELETE FROM building_queue WHERE id = p_queue_id;

  -- Get the next item that will become first
  SELECT * INTO v_next_item
  FROM building_queue
  WHERE planet_id = v_queue.planet_id
  ORDER BY queue_position
  LIMIT 1;

  IF FOUND AND v_next_item.start_time IS NULL THEN
    -- Get robotics level
    SELECT COALESCE(pb.level, 0) INTO v_robotics_level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = v_queue.planet_id AND bt.code = 'robotics_factory';
    IF v_robotics_level IS NULL THEN v_robotics_level := 0; END IF;

    -- Get nanite level
    SELECT COALESCE(pb.level, 0) INTO v_nanite_level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = v_queue.planet_id AND bt.code = 'nanite_factory';
    IF v_nanite_level IS NULL THEN v_nanite_level := 0; END IF;

    -- Get game speed
    v_game_speed := get_game_speed();

    -- RECALCULATE correct build time with current game speed
    v_correct_build_time := GREATEST(1, FLOOR(
      (v_next_item.metal_cost + v_next_item.crystal_cost) /
      (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) *
      3600 /
      v_game_speed
    ));

    -- Update the next item with corrected build time
    UPDATE building_queue
    SET
      queue_position = 1,
      start_time = NOW(),
      build_time = v_correct_build_time,
      end_time = NOW() + (v_correct_build_time || ' seconds')::interval
    WHERE id = v_next_item.id;
  END IF;

  -- Reorder remaining items
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue.planet_id AND id != COALESCE(v_next_item.id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  UPDATE building_queue bq
  SET queue_position = r.new_pos + 1
  FROM reordered r
  WHERE bq.id = r.id;

  RETURN jsonb_build_object('success', true, 'building_type_id', v_queue.building_type_id, 'new_level', v_queue.target_level);
END;
$$;
