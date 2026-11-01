CREATE OR REPLACE FUNCTION public.secure_cancel_building_queue_item(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_planet RECORD;
  v_is_first boolean;
  v_game_speed numeric;
  v_refund_metal numeric;
  v_refund_crystal numeric;
  v_refund_deuterium numeric;
  v_elapsed_seconds numeric;
  v_total_seconds numeric;
  v_remaining_percent numeric;
  v_current_level integer;
  v_seq integer;
  v_rec RECORD;
  v_new_target_level integer;
  v_building_type RECORD;
  v_new_cost_metal bigint;
  v_new_cost_crystal bigint;
  v_new_cost_deuterium bigint;
  v_diff_metal bigint;
  v_diff_crystal bigint;
  v_diff_deuterium bigint;
  v_total_diff_metal bigint := 0;
  v_total_diff_crystal bigint := 0;
  v_total_diff_deuterium bigint := 0;
  v_robotics_level integer;
  v_nanite_level integer;
  v_new_build_time integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  SELECT * INTO v_queue_item FROM building_queue WHERE id = p_queue_id;
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found');
  END IF;
  
  SELECT * INTO v_planet FROM planets WHERE id = v_queue_item.planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not owned by user');
  END IF;
  
  v_is_first := v_queue_item.queue_position = 1;
  
  IF v_queue_item.start_time IS NULL OR v_queue_item.end_time IS NULL THEN
    v_refund_metal := v_queue_item.metal_cost;
    v_refund_crystal := v_queue_item.crystal_cost;
    v_refund_deuterium := v_queue_item.deuterium_cost;
  ELSE
    v_elapsed_seconds := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_queue_item.start_time)));
    v_total_seconds := EXTRACT(EPOCH FROM (v_queue_item.end_time - v_queue_item.start_time));
    
    IF v_elapsed_seconds >= v_total_seconds THEN
      v_remaining_percent := 0;
    ELSE
      v_remaining_percent := (v_total_seconds - v_elapsed_seconds) / v_total_seconds;
    END IF;
    
    v_refund_metal := FLOOR(v_queue_item.metal_cost * v_remaining_percent);
    v_refund_crystal := FLOOR(v_queue_item.crystal_cost * v_remaining_percent);
    v_refund_deuterium := FLOOR(v_queue_item.deuterium_cost * v_remaining_percent);
  END IF;
  
  UPDATE planet_resources
  SET 
    metal = metal + v_refund_metal,
    crystal = crystal + v_refund_crystal,
    deuterium = deuterium + v_refund_deuterium,
    last_update = now()
  WHERE planet_id = v_queue_item.planet_id;
  
  DELETE FROM building_queue WHERE id = p_queue_id;
  
  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = v_queue_item.planet_id
  )
  UPDATE building_queue bq
  SET queue_position = r.new_pos
  FROM reordered r
  WHERE bq.id = r.id;
  
  -- Recalculate target_level for remaining items of the SAME building type
  SELECT COALESCE(pb.level, 0) INTO v_current_level
  FROM planet_buildings pb
  WHERE pb.planet_id = v_queue_item.planet_id AND pb.building_type_id = v_queue_item.building_type_id;
  v_current_level := COALESCE(v_current_level, 0);

  SELECT * INTO v_building_type FROM building_types WHERE id = v_queue_item.building_type_id;

  SELECT COALESCE(pb.level, 0) INTO v_robotics_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = v_queue_item.planet_id AND bt.code = 'robotics_factory';
  v_robotics_level := COALESCE(v_robotics_level, 0);

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = v_queue_item.planet_id AND bt.code = 'nanite_factory';
  v_nanite_level := COALESCE(v_nanite_level, 0);

  v_game_speed := get_game_speed();

  v_seq := 0;
  FOR v_rec IN
    SELECT id, target_level, metal_cost, crystal_cost, deuterium_cost, queue_position, start_time
    FROM building_queue
    WHERE planet_id = v_queue_item.planet_id
      AND building_type_id = v_queue_item.building_type_id
    ORDER BY queue_position
  LOOP
    v_seq := v_seq + 1;
    v_new_target_level := v_current_level + v_seq;

    IF v_new_target_level != v_rec.target_level THEN
      v_new_cost_metal := FLOOR(v_building_type.base_metal * POWER(v_building_type.cost_factor, v_new_target_level - 1));
      v_new_cost_crystal := FLOOR(v_building_type.base_crystal * POWER(v_building_type.cost_factor, v_new_target_level - 1));
      v_new_cost_deuterium := FLOOR(v_building_type.base_deuterium * POWER(v_building_type.cost_factor, v_new_target_level - 1));

      v_diff_metal := v_rec.metal_cost - v_new_cost_metal;
      v_diff_crystal := v_rec.crystal_cost - v_new_cost_crystal;
      v_diff_deuterium := v_rec.deuterium_cost - v_new_cost_deuterium;

      v_total_diff_metal := v_total_diff_metal + v_diff_metal;
      v_total_diff_crystal := v_total_diff_crystal + v_diff_crystal;
      v_total_diff_deuterium := v_total_diff_deuterium + v_diff_deuterium;

      v_new_build_time := GREATEST(1, FLOOR(
        (v_new_cost_metal + v_new_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed
      ));
      v_new_build_time := public.apply_vip_time_bonus(auth.uid(), v_new_build_time);

      IF v_rec.start_time IS NOT NULL THEN
        UPDATE building_queue
        SET target_level = v_new_target_level,
            metal_cost = v_new_cost_metal,
            crystal_cost = v_new_cost_crystal,
            deuterium_cost = v_new_cost_deuterium,
            build_time = v_new_build_time,
            end_time = start_time + (v_new_build_time || ' seconds')::interval
        WHERE id = v_rec.id;
      ELSE
        UPDATE building_queue
        SET target_level = v_new_target_level,
            metal_cost = v_new_cost_metal,
            crystal_cost = v_new_cost_crystal,
            deuterium_cost = v_new_cost_deuterium,
            build_time = v_new_build_time
        WHERE id = v_rec.id;
      END IF;
    END IF;
  END LOOP;

  IF v_total_diff_metal != 0 OR v_total_diff_crystal != 0 OR v_total_diff_deuterium != 0 THEN
    UPDATE planet_resources
    SET
      metal = metal + v_total_diff_metal,
      crystal = crystal + v_total_diff_crystal,
      deuterium = deuterium + v_total_diff_deuterium
    WHERE planet_id = v_queue_item.planet_id;
  END IF;

  IF v_is_first THEN
    UPDATE building_queue
    SET 
      start_time = now(),
      end_time = now() + (build_time || ' seconds')::interval
    WHERE planet_id = v_queue_item.planet_id
      AND queue_position = 1
      AND start_time IS NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'refunded_metal', FLOOR(v_refund_metal),
    'refunded_crystal', FLOOR(v_refund_crystal),
    'refunded_deuterium', FLOOR(v_refund_deuterium),
    'was_in_progress', v_queue_item.start_time IS NOT NULL,
    'percent_refunded', CASE 
      WHEN v_queue_item.start_time IS NULL THEN 100 
      ELSE FLOOR(v_remaining_percent * 100) 
    END
  );
END;
$function$

