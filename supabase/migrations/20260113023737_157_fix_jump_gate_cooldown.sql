/*
  # Fix Jump Gate Cooldown

  ## Summary
  The Jump Gate cooldown was incorrectly calculated as 60/level hours.
  At level 1 (max level), this resulted in 60 hours cooldown, which is wrong.
  
  In XNova/OGame, the Jump Gate has approximately 1 hour cooldown.
  
  ## Changes
  - Updated `use_jump_gate` function to use 1 hour base cooldown
  - Formula: 60 minutes / level (so level 1 = 1 hour)
*/

CREATE OR REPLACE FUNCTION use_jump_gate(
  p_origin_moon_id uuid,
  p_target_moon_id uuid,
  p_ships jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origin_moon record;
  v_target_moon record;
  v_origin_gate_level integer;
  v_target_gate_level integer;
  v_cooldown_minutes integer;
  v_ship record;
  v_ship_type_id integer;
  v_ship_quantity integer;
  v_available_quantity integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Not authenticated');
  END IF;

  SELECT p.*, pb.level as gate_level
  INTO v_origin_moon
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
  WHERE p.id = p_origin_moon_id AND p.planet_type = 'moon' AND p.user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Origin moon not found or not owned');
  END IF;

  SELECT p.*, pb.level as gate_level
  INTO v_target_moon
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
  WHERE p.id = p_target_moon_id AND p.planet_type = 'moon' AND p.user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Target moon not found or not owned');
  END IF;

  v_origin_gate_level := COALESCE(v_origin_moon.gate_level, 0);
  v_target_gate_level := COALESCE(v_target_moon.gate_level, 0);

  IF v_origin_gate_level = 0 OR v_target_gate_level = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Both moons need a Jump Gate');
  END IF;

  IF v_origin_moon.jump_gate_cooldown IS NOT NULL AND v_origin_moon.jump_gate_cooldown > NOW() THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', 'Jump Gate on cooldown',
      'cooldown_ends', v_origin_moon.jump_gate_cooldown
    );
  END IF;

  FOR v_ship IN SELECT * FROM jsonb_array_elements(p_ships)
  LOOP
    v_ship_type_id := (v_ship.value->>'ship_type_id')::integer;
    v_ship_quantity := (v_ship.value->>'quantity')::integer;

    SELECT COALESCE(quantity, 0) INTO v_available_quantity
    FROM planet_ships
    WHERE planet_id = p_origin_moon_id AND ship_type_id = v_ship_type_id;

    IF v_available_quantity < v_ship_quantity THEN
      RETURN jsonb_build_object('success', false, 'reason', 'Insufficient ships');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_ship_quantity
    WHERE planet_id = p_origin_moon_id AND ship_type_id = v_ship_type_id;

    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_target_moon_id, v_ship_type_id, v_ship_quantity)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
  END LOOP;

  v_cooldown_minutes := 60;

  UPDATE planets
  SET jump_gate_cooldown = NOW() + (v_cooldown_minutes || ' minutes')::interval
  WHERE id = p_origin_moon_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fleet teleported successfully',
    'cooldown_minutes', v_cooldown_minutes
  );
END;
$$;
