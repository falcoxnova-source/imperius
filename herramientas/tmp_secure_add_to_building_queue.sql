CREATE OR REPLACE FUNCTION public.secure_add_to_building_queue(p_planet_id uuid, p_building_type_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_building_type RECORD;
  v_current_level integer;
  v_queued_count integer;
  v_target_level integer;
  v_resources RECORD;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_queue_position integer;
  v_robotics_level integer;
  v_nanite_level integer;
  v_build_time integer;
  v_is_first boolean;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_total_queued_levels integer;
  v_game_speed integer;
  v_is_moon boolean;
  v_moon_only_buildings text[];
  v_planet_only_buildings text[];
  v_has_active_research boolean;
  v_speed_bonus numeric;
  BEGIN
  v_validation := validate_building_queue(p_planet_id, p_building_type_id);
  IF (v_validation->>'valid')::boolean IS DISTINCT FROM true THEN
    RETURN v_validation;
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  v_is_moon := COALESCE(v_planet.is_moon, false);

  SELECT * INTO v_building_type FROM building_types WHERE id = p_building_type_id;

  SELECT COALESCE(pb.level, 0) INTO v_current_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.id = p_building_type_id;

  v_target_level := v_current_level + 1;

  SELECT COUNT(*) INTO v_queued_count
  FROM building_queue
  WHERE planet_id = p_planet_id AND completed = false;

  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_queue_position
  FROM building_queue
  WHERE planet_id = p_planet_id;

  v_cost_metal := (v_validation->>'cost_metal')::bigint;
  v_cost_crystal := (v_validation->>'cost_crystal')::bigint;
  v_cost_deuterium := (v_validation->>'cost_deuterium')::bigint;

  SELECT COALESCE(pb.level, 0) INTO v_robotics_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'robotics_factory';

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

  v_game_speed := get_game_speed();

  v_build_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (2500.0 * (1 + v_robotics_level) * POWER(2, v_nanite_level)) * 3600 / v_game_speed));

  -- VIP Plus: -10% construction time
  IF is_user_plus(auth.uid()) THEN
    v_build_time := GREATEST(1, FLOOR(v_build_time * 0.90));
  END IF;

  -- Daily missions speed bonus
  v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());
  IF v_speed_bonus > 0 THEN
    v_build_time := GREATEST(1, FLOOR(v_build_time * (1 - v_speed_bonus)));
  END IF;

  v_is_first := v_queue_position = 1;
  IF v_is_first THEN
  v_start_time := now();
  v_end_time := now() + (v_build_time || ' seconds')::interval;
  ELSE
  v_start_time := NULL;
  v_end_time := NULL;
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium
  WHERE planet_id = p_planet_id;

  INSERT INTO building_queue (planet_id, user_id, building_type_id, target_level, queue_position, island, start_time, end_time)
  VALUES (p_planet_id, auth.uid(), p_building_type_id, v_target_level, v_queue_position, v_is_first, v_start_time, v_end_time);

  RETURN jsonb_build_object(
    'success', true,
    'target_level', v_target_level,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'build_time_seconds', v_build_time,
    'queue_position', v_queue_position
  );
  END;
  $function$
