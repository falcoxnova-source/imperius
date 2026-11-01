/*
  # Fix Shipyard Queue Validation Function Calls

  1. Problem
    - `secure_add_to_shipyard_queue` calls `validate_defense_requirements(auth.uid(), p_planet_id, p_type_id)` with 3 params
    - But the function signature is `validate_defense_requirements(p_planet_id uuid, p_defense_type_id integer)` - only 2 params
    - Same issue with `validate_ship_requirements`

  2. Solution
    - Update `secure_add_to_shipyard_queue` to use correct 2-parameter calls
    - The planet ownership is already validated earlier in the function
*/

CREATE OR REPLACE FUNCTION secure_add_to_shipyard_queue(
  p_planet_id uuid,
  p_item_type text,
  p_type_id integer,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_resources planet_resources%ROWTYPE;
  v_shipyard_level integer;
  v_nanite_level integer;
  v_metal_cost bigint;
  v_crystal_cost bigint;
  v_deuterium_cost bigint;
  v_build_time_per_unit integer;
  v_queue_position integer;
  v_validation jsonb;
  v_game_speed integer;
  v_ship_type ship_types%ROWTYPE;
  v_defense_type defense_types%ROWTYPE;
  v_existing_count integer;
  v_queued_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_quantity <= 0 OR p_quantity > 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  IF p_item_type = 'ship' THEN
    v_validation := validate_ship_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;

    SELECT * INTO v_ship_type FROM ship_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;

    v_metal_cost := v_ship_type.metal_cost * p_quantity;
    v_crystal_cost := v_ship_type.crystal_cost * p_quantity;
    v_deuterium_cost := v_ship_type.deuterium_cost * p_quantity;
  ELSIF p_item_type = 'defense' THEN
    v_validation := validate_defense_requirements(p_planet_id, p_type_id);
    IF NOT (v_validation->>'valid')::boolean THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requirements not met');
    END IF;

    SELECT * INTO v_defense_type FROM defense_types WHERE id = p_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
    END IF;

    IF v_defense_type.max_per_planet IS NOT NULL THEN
      SELECT COALESCE(pd.quantity, 0) INTO v_existing_count
      FROM planet_defenses pd
      WHERE pd.planet_id = p_planet_id AND pd.defense_type_id = p_type_id;

      SELECT COALESCE(SUM(sq.quantity - sq.quantity_completed), 0) INTO v_queued_count
      FROM shipyard_queue sq
      WHERE sq.planet_id = p_planet_id AND sq.defense_type_id = p_type_id;

      IF (COALESCE(v_existing_count, 0) + COALESCE(v_queued_count, 0) + p_quantity) > v_defense_type.max_per_planet THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maximum limit reached for this defense type');
      END IF;
    END IF;

    v_metal_cost := v_defense_type.metal_cost * p_quantity;
    v_crystal_cost := v_defense_type.crystal_cost * p_quantity;
    v_deuterium_cost := v_defense_type.deuterium_cost * p_quantity;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
  END IF;

  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF v_resources.metal < v_metal_cost OR v_resources.crystal < v_crystal_cost OR v_resources.deuterium < v_deuterium_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'shipyard';

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'nanite_factory';

  v_game_speed := get_game_speed();

  IF p_item_type = 'ship' THEN
    v_build_time_per_unit := GREATEST(1, FLOOR((v_ship_type.metal_cost + v_ship_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  ELSE
    v_build_time_per_unit := GREATEST(1, FLOOR((v_defense_type.metal_cost + v_defense_type.crystal_cost) / (2500.0 * (1 + COALESCE(v_shipyard_level, 0))) * 3600 / POWER(2, COALESCE(v_nanite_level, 0)) / v_game_speed));
  END IF;

  UPDATE planet_resources
  SET metal = metal - v_metal_cost,
      crystal = crystal - v_crystal_cost,
      deuterium = deuterium - v_deuterium_cost,
      last_update = now()
  WHERE planet_id = p_planet_id;

  SELECT COALESCE(MAX(queue_position), 0) INTO v_queue_position FROM shipyard_queue WHERE planet_id = p_planet_id;

  INSERT INTO shipyard_queue (
    planet_id, item_type, ship_type_id, defense_type_id,
    quantity, quantity_completed,
    metal_cost, crystal_cost, deuterium_cost,
    build_time_per_unit, queue_position,
    start_time, current_unit_end_time
  ) VALUES (
    p_planet_id, p_item_type,
    CASE WHEN p_item_type = 'ship' THEN p_type_id ELSE NULL END,
    CASE WHEN p_item_type = 'defense' THEN p_type_id ELSE NULL END,
    p_quantity, 0,
    v_metal_cost, v_crystal_cost, v_deuterium_cost,
    v_build_time_per_unit, v_queue_position + 1,
    CASE WHEN v_queue_position = 0 THEN now() ELSE NULL END,
    CASE WHEN v_queue_position = 0 THEN now() + (v_build_time_per_unit || ' seconds')::interval ELSE NULL END
  );

  RETURN jsonb_build_object('success', true, 'build_time_per_unit', v_build_time_per_unit);
END;
$$;
