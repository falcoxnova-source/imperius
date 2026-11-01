import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Patch building queue: add speed bonus call after VIP block
await c.query(`
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
  $function$;
`);
console.log('secure_add_to_building_queue OK');

// Patch research
await c.query(`
  CREATE OR REPLACE FUNCTION public.secure_start_research(p_planet_id uuid, p_tech_type_id integer)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  DECLARE
  v_validation jsonb;
  v_tech_type RECORD;
  v_planet RECORD;
  v_planet_buildings RECORD;
  v_current_tech RECORD;
  v_current_level integer;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_effective_lab_level integer;
  v_research_time integer;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_queued_count integer;
  v_resources RECORD;
  v_has_active_research boolean;
  v_game_speed integer;
  v_has_technocrat boolean;
  v_speed_bonus numeric;
  v_has_commander boolean;
  v_queued_count integer;
  v_lab_in_queue boolean;
  BEGIN
  -- Get tech type
  SELECT * INTO v_tech_type FROM technology_types WHERE id = p_tech_type_id;

  -- Get planet
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;

  -- Get current level for this user AND this tech
  SELECT ut.level, ut.is_researching INTO v_current_tech
  FROM user_technologies ut
  WHERE ut.user_id = auth.uid() AND ut.technology_type_id = p_tech_type_id;

  v_current_level := COALESCE(v_current_tech.level, 0);

  -- Check if research lab exists
  SELECT pb.level INTO v_planet_buildings
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'research_lab';

  IF v_planet_buildings IS NULL OR COALESCE(v_planet_buildings.level, 0) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes laboratorio de investigacion');
  END IF;

  -- Check if already researching on this planet
  SELECT COUNT(*) INTO v_has_active_research
  FROM user_technologies ut
  WHERE ut.user_id = auth.uid() AND ut.is_researching = true;

  IF v_has_active_research > 0 THEN
    -- Check queue count
    SELECT COUNT(*) INTO v_queued_count
    FROM research_queue
    WHERE user_id = auth.uid() AND completed = false;

    -- Commander officer: +2 queue slots (total 3)
    v_has_commander := has_active_officer(auth.uid(), 'commander');
    IF v_has_commander AND v_queued_count < 2 THEN
      NULL;
    ELSIF v_queued_count >= 1 THEN
      -- Can queue without commander
      NULL;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Ya hay una investigacion en curso. Usa la cola de investigacion.');
    END IF;
  END IF;

  -- Get costs
  v_cost_metal := v_tech_type.base_metal * FLOOR(POWER(v_tech_type.cost_factor, GREATEST(0, v_current_level)));
  v_cost_crystal := v_tech_type.base_crystal * FLOOR(POWER(v_tech_type.cost_factor, GREATEST(0, v_current_level)));
  v_cost_deuterium := v_tech_type.base_deuterium * FLOOR(POWER(v_tech_type.cost_factor, GREATEST(0, v_current_level)));

  -- Check resources (including queued items cost)
  SELECT metal, crystal, deuterium INTO v_resources
  FROM planet_resources WHERE planet_id = p_planet_id;

  -- Subtract queued research costs
  SELECT COALESCE(SUM(rq.cost_metal), 0), COALESCE(SUM(rq.cost_crystal), 0), COALESCE(SUM(rq.cost_deuterium), 0)
  INTO v_cost_metal, v_cost_crystal, v_cost_deuterium
  FROM research_queue rq
  WHERE rq.user_id = auth.uid() AND rq.completed = false;

  IF COALESCE(v_resources.metal, 0) < v_cost_metal OR COALESCE(v_resources.crystal, 0) < v_cost_crystal OR COALESCE(v_resources.deuterium, 0) < v_cost_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos insuficientes');
  END IF;

  -- Check if lab is being upgraded (can't research while lab is being built)
  SELECT COUNT(*) > 0 INTO v_lab_in_queue
  FROM building_queue bq
  JOIN building_types bt ON bt.id = bq.building_type_id
  WHERE bq.planet_id = p_planet_id AND bq.completed = false AND bt.code = 'research_lab';

  IF v_lab_in_queue THEN
    RETURN jsonb_build_object('success', false, 'error', 'El laboratorio esta siendo mejorado. Espera a que termine.');
  END IF;

  IF v_has_active_research > 0 THEN
    -- Add to research queue
    v_game_speed := get_game_speed();
    v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');
    v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));
    IF v_has_technocrat THEN
      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
    END IF;
    IF is_user_plus(auth.uid()) THEN
      v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));
    END IF;
    v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());
    IF v_speed_bonus > 0 THEN
      v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));
    END IF;

    UPDATE planet_resources
    SET metal = metal - v_cost_metal,
        crystal = crystal - v_cost_crystal,
        deuterium = deuterium - v_cost_deuterium
    WHERE planet_id = p_planet_id;

    INSERT INTO research_queue (user_id, technology_type_id, target_level, queue_position, cost_metal, cost_crystal, cost_deuterium, start_time, end_time)
    VALUES (auth.uid(), p_tech_type_id, v_current_level + 1, v_queued_count + 1, v_cost_metal, v_cost_crystal, v_cost_deuterium, now(), now() + (v_research_time || ' seconds')::interval);

    RETURN jsonb_build_object(
      'success', true,
      'target_level', v_current_level + 1,
      'queued', true,
      'queue_position', v_queued_count + 1,
      'research_time_seconds', v_research_time
    );
  END IF;

  -- Deduct resources
  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium
  WHERE planet_id = p_planet_id;

  v_effective_lab_level := calculate_irn_lab_level(auth.uid(), p_planet_id);
  v_game_speed := get_game_speed();
  v_has_technocrat := has_active_officer(auth.uid(), 'technocrat');
  v_research_time := GREATEST(1, FLOOR((v_cost_metal + v_cost_crystal) / (1000.0 * (1 + v_effective_lab_level)) * 3600 / v_game_speed));
  IF v_has_technocrat THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.75));
  END IF;
  IF is_user_plus(auth.uid()) THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * 0.90));
  END IF;
  v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());
  IF v_speed_bonus > 0 THEN
    v_research_time := GREATEST(1, FLOOR(v_research_time * (1 - v_speed_bonus)));
  END IF;

  v_start_time := now();
  v_end_time := v_start_time + (v_research_time || ' seconds')::interval;

  INSERT INTO user_technologies (user_id, technology_type_id, level, is_researching)
  VALUES (auth.uid(), p_tech_type_id, v_current_level, true)
  ON CONFLICT (user_id, technology_type_id) DO UPDATE SET
    is_researching = true,
    level = EXCLUDED.level;

  RETURN jsonb_build_object(
    'success', true,
    'target_level', v_current_level + 1,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'research_time_seconds', v_research_time,
    'technocrat_bonus', v_has_technocrat
  );
  END;
  $function$;
`);
console.log('secure_start_research OK');

// Patch shipyard queue
await c.query(`
  CREATE OR REPLACE FUNCTION public.secure_add_to_shipyard_queue(
    p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer
  )
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  DECLARE
  v_validation jsonb;
  v_planet RECORD;
  v_ship_type RECORD;
  v_defense_type RECORD;
  v_user_id uuid;
  v_fleet_points bigint;
  v_defense_points bigint;
  v_cost_metal bigint;
  v_cost_crystal bigint;
  v_cost_deuterium bigint;
  v_shipyard_level integer;
  v_nanite_level integer;
  v_build_time_per_unit integer;
  v_game_speed integer;
  v_queued_ships integer;
  v_ship_type_energy numeric;
  v_is_moon boolean;
  v_current_fleet_points bigint;
  v_ship_limit_points bigint;
  v_ship_limit_reached boolean;
  v_current_fleet_count integer;
  v_current_fleet_count_limit integer;
  v_speed_bonus numeric;
  BEGIN
  v_validation := validate_shipyard_queue(p_planet_id, p_item_type, p_type_id, p_quantity);
  IF (v_validation->>'valid')::boolean IS DISTINCT FROM true THEN
    RETURN v_validation;
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  v_is_moon := COALESCE(v_planet.is_moon, false);
  v_user_id := v_planet.user_id;

  IF p_item_type = 'ship' THEN
    SELECT * INTO v_ship_type FROM ship_types WHERE id = p_type_id;
  ELSE
    SELECT * INTO v_defense_type FROM defense_types WHERE id = p_type_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_queued_ships
  FROM shipyard_queue
  WHERE planet_id = p_planet_id AND completed = false;

  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

  v_game_speed := get_game_speed();

  IF p_item_type = 'ship' THEN
    v_build_time_per_unit := GREATEST(1, FLOOR((v_ship_type.metal_cost + v_ship_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  ELSE
    v_build_time_per_unit := GREATEST(1, FLOOR((v_defense_type.metal_cost + v_defense_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  END IF;

  -- VIP Plus: -10% shipyard construction time
  IF is_user_plus(auth.uid()) THEN
    v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));
  END IF;

  -- Daily missions speed bonus
  v_speed_bonus := get_user_daily_mission_speed_bonus(auth.uid());
  IF v_speed_bonus > 0 THEN
    v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * (1 - v_speed_bonus)));
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_cost_metal,
      crystal = crystal - v_cost_crystal,
      deuterium = deuterium - v_cost_deuterium
  WHERE planet_id = p_planet_id;

  INSERT INTO shipyard_queue (planet_id, user_id, item_type, type_id, quantity, build_time_per_unit, queue_position, created_at)
  VALUES (p_planet_id, v_user_id, p_item_type, p_type_id, p_quantity, v_build_time_per_unit, v_queued_ships + 1, now());

  RETURN jsonb_build_object(
    'success', true,
    'build_time_per_unit', v_build_time_per_unit,
    'total_time', v_build_time_per_unit * p_quantity,
    'queue_position', v_queued_ships + 1
  );
  END;
  $function$;
`);
console.log('secure_add_to_shipyard_queue OK');

console.log('\nTodo completado.');
await c.end();
