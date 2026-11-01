/*
  # Add max_per_planet limit for shield domes

  1. Changes
    - Add max_per_planet column to defense_types table
    - Set limit of 1 for Small Shield Dome and Large Shield Dome
    - Update add_to_shipyard_queue function to enforce this limit

  2. Business Logic
    - According to original XNova game rules, each planet can only have:
      - 1 Small Shield Dome
      - 1 Large Shield Dome
    - This constraint ensures game balance
*/

ALTER TABLE defense_types ADD COLUMN IF NOT EXISTS max_per_planet integer DEFAULT NULL;

UPDATE defense_types SET max_per_planet = 1 WHERE code = 'small_shield_dome';
UPDATE defense_types SET max_per_planet = 1 WHERE code = 'large_shield_dome';

CREATE OR REPLACE FUNCTION add_to_shipyard_queue(
  p_planet_id uuid,
  p_item_type text,
  p_ship_type_id integer DEFAULT NULL,
  p_defense_type_id integer DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_item record;
  v_shipyard_level integer;
  v_nanite_level integer;
  v_total_metal numeric;
  v_total_crystal numeric;
  v_total_deuterium numeric;
  v_build_time_per_unit numeric;
  v_existing_quantity integer;
  v_in_queue_quantity integer;
  v_max_per_planet integer;
  v_allowed_quantity integer;
  v_queue_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = v_user_id;
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_shipyard_level
  FROM building_types bt
  LEFT JOIN planet_buildings pb ON pb.building_type_id = bt.id AND pb.planet_id = p_planet_id
  WHERE bt.code = 'shipyard';

  SELECT COALESCE(pb.level, 0) INTO v_nanite_level
  FROM building_types bt
  LEFT JOIN planet_buildings pb ON pb.building_type_id = bt.id AND pb.planet_id = p_planet_id
  WHERE bt.code = 'nanite_factory';

  IF p_item_type = 'ship' THEN
    SELECT * INTO v_item FROM ship_types WHERE id = p_ship_type_id;
    IF v_item IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;
    v_max_per_planet := NULL;
  ELSIF p_item_type = 'defense' THEN
    SELECT * INTO v_item FROM defense_types WHERE id = p_defense_type_id;
    IF v_item IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Defense type not found');
    END IF;
    v_max_per_planet := v_item.max_per_planet;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid item type');
  END IF;

  IF v_max_per_planet IS NOT NULL THEN
    IF p_item_type = 'defense' THEN
      SELECT COALESCE(quantity, 0) INTO v_existing_quantity
      FROM planet_defenses
      WHERE planet_id = p_planet_id AND defense_type_id = p_defense_type_id;

      SELECT COALESCE(SUM(quantity - quantity_completed), 0) INTO v_in_queue_quantity
      FROM shipyard_queue
      WHERE planet_id = p_planet_id AND defense_type_id = p_defense_type_id AND status IN ('pending', 'building');

      v_allowed_quantity := GREATEST(0, v_max_per_planet - COALESCE(v_existing_quantity, 0) - v_in_queue_quantity);

      IF v_allowed_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Maximum quantity reached for this defense type');
      END IF;

      IF p_quantity > v_allowed_quantity THEN
        p_quantity := v_allowed_quantity;
      END IF;
    END IF;
  END IF;

  v_total_metal := v_item.metal_cost * p_quantity;
  v_total_crystal := v_item.crystal_cost * p_quantity;
  v_total_deuterium := v_item.deuterium_cost * p_quantity;

  IF v_planet.metal < v_total_metal OR v_planet.crystal < v_total_crystal OR v_planet.deuterium < v_total_deuterium THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient resources');
  END IF;

  v_build_time_per_unit := ((v_item.metal_cost + v_item.crystal_cost) / (2500.0 * (1 + v_shipyard_level))) * (0.5 ^ v_nanite_level) * 3600;
  v_build_time_per_unit := GREATEST(1, v_build_time_per_unit);

  UPDATE planets SET
    metal = metal - v_total_metal,
    crystal = crystal - v_total_crystal,
    deuterium = deuterium - v_total_deuterium
  WHERE id = p_planet_id;

  INSERT INTO shipyard_queue (planet_id, item_type, ship_type_id, defense_type_id, quantity, build_time_per_unit)
  VALUES (p_planet_id, p_item_type, p_ship_type_id, p_defense_type_id, p_quantity, v_build_time_per_unit)
  RETURNING id INTO v_queue_id;

  PERFORM start_shipyard_queue_item();

  RETURN jsonb_build_object('success', true, 'queue_id', v_queue_id, 'quantity', p_quantity);
END;
$$;