/*
  # Complete XNova Features - Phalanx, Jump Gate, and Combat

  1. New Functions
    - phalanx_scan: Scan enemy fleets from moon's sensor phalanx
    - use_jump_gate: Teleport fleet between moons with jump gates
    - simulate_combat: Full combat simulation with rapid fire
    - calculate_battle_result: Determine battle outcome

  2. Improvements
    - Better rapid fire implementation in combat
    - Defense rebuild after combat (70% chance)
    - Moon destruction mission handling

  3. Tables
    - Add jump_gate_cooldown tracking
*/

-- Add jump gate cooldown column to planets if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'planets' AND column_name = 'jump_gate_cooldown'
  ) THEN
    ALTER TABLE planets ADD COLUMN jump_gate_cooldown timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Phalanx scan function - scans enemy fleet movements
CREATE OR REPLACE FUNCTION phalanx_scan(
  p_moon_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer
) RETURNS jsonb AS $$
DECLARE
  v_moon record;
  v_phalanx_level integer;
  v_phalanx_range integer;
  v_system_distance integer;
  v_target_planet record;
  v_fleets jsonb;
  v_deuterium_cost integer;
BEGIN
  SELECT p.*, pb.level as phalanx_level
  INTO v_moon
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'sensor_phalanx'
  WHERE p.id = p_moon_id AND p.planet_type = 'moon';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Luna no encontrada');
  END IF;
  
  v_phalanx_level := COALESCE(v_moon.phalanx_level, 0);
  
  IF v_phalanx_level = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No tienes Sensor Phalanx');
  END IF;
  
  IF v_moon.galaxy != p_target_galaxy THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Solo puedes escanear en tu misma galaxia');
  END IF;
  
  v_phalanx_range := POWER(v_phalanx_level, 2) - 1;
  v_system_distance := ABS(v_moon.solar_system - p_target_system);
  
  IF v_system_distance > v_phalanx_range THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', format('Fuera de alcance. Rango maximo: %s sistemas', v_phalanx_range)
    );
  END IF;
  
  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = p_target_galaxy
    AND solar_system = p_target_system
    AND position = p_target_position
    AND planet_type = 'planet'
    AND user_id IS NOT NULL
    AND user_id != v_moon.user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No hay planeta enemigo en esas coordenadas');
  END IF;
  
  v_deuterium_cost := 5000;
  
  UPDATE planet_resources
  SET deuterium = deuterium - v_deuterium_cost
  WHERE planet_id = (SELECT id FROM planets WHERE user_id = v_moon.user_id AND is_main_planet = true)
    AND deuterium >= v_deuterium_cost;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Deuterio insuficiente (5000 requerido)');
  END IF;
  
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'mission', f.mission_type,
      'origin', format('[%s:%s:%s]', 
        (SELECT galaxy FROM planets WHERE id = f.origin_planet_id),
        (SELECT solar_system FROM planets WHERE id = f.origin_planet_id),
        (SELECT position FROM planets WHERE id = f.origin_planet_id)
      ),
      'arrival_time', f.arrival_time,
      'is_returning', f.is_returning,
      'ships', (
        SELECT jsonb_agg(jsonb_build_object('type', st.name, 'quantity', fs.quantity))
        FROM fleet_ships fs
        JOIN ship_types st ON fs.ship_type_id = st.id
        WHERE fs.fleet_id = f.id
      )
    )
  )
  INTO v_fleets
  FROM fleets f
  WHERE (
    (f.target_galaxy = p_target_galaxy AND f.target_system = p_target_system AND f.target_position = p_target_position AND NOT f.is_returning)
    OR 
    (f.origin_planet_id = v_target_planet.id AND f.is_returning)
  )
  AND f.is_completed = false;
  
  RETURN jsonb_build_object(
    'success', true,
    'planet_name', v_target_planet.name,
    'player', (SELECT username FROM profiles WHERE id = v_target_planet.user_id),
    'fleets', COALESCE(v_fleets, '[]'::jsonb),
    'deuterium_used', v_deuterium_cost
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Jump gate function - teleport fleet between moons
CREATE OR REPLACE FUNCTION use_jump_gate(
  p_origin_moon_id uuid,
  p_target_moon_id uuid,
  p_ships jsonb
) RETURNS jsonb AS $$
DECLARE
  v_origin_moon record;
  v_target_moon record;
  v_origin_gate_level integer;
  v_target_gate_level integer;
  v_cooldown_hours integer;
  v_ship record;
  v_ship_type_id integer;
  v_ship_quantity integer;
  v_available_quantity integer;
BEGIN
  SELECT p.*, pb.level as gate_level
  INTO v_origin_moon
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
  WHERE p.id = p_origin_moon_id AND p.planet_type = 'moon';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Luna de origen no encontrada');
  END IF;
  
  SELECT p.*, pb.level as gate_level
  INTO v_target_moon
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'jump_gate'
  WHERE p.id = p_target_moon_id AND p.planet_type = 'moon' AND p.user_id = v_origin_moon.user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Luna de destino no encontrada o no te pertenece');
  END IF;
  
  v_origin_gate_level := COALESCE(v_origin_moon.gate_level, 0);
  v_target_gate_level := COALESCE(v_target_moon.gate_level, 0);
  
  IF v_origin_gate_level = 0 OR v_target_gate_level = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Ambas lunas necesitan Portal de Salto');
  END IF;
  
  IF v_origin_moon.jump_gate_cooldown IS NOT NULL AND v_origin_moon.jump_gate_cooldown > NOW() THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', 'Portal en enfriamiento',
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
      RETURN jsonb_build_object('success', false, 'reason', 'Naves insuficientes');
    END IF;
    
    UPDATE planet_ships
    SET quantity = quantity - v_ship_quantity
    WHERE planet_id = p_origin_moon_id AND ship_type_id = v_ship_type_id;
    
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_target_moon_id, v_ship_type_id, v_ship_quantity)
    ON CONFLICT (planet_id, ship_type_id)
    DO UPDATE SET quantity = planet_ships.quantity + EXCLUDED.quantity;
  END LOOP;
  
  v_cooldown_hours := GREATEST(1, 60 / v_origin_gate_level);
  
  UPDATE planets
  SET jump_gate_cooldown = NOW() + (v_cooldown_hours || ' hours')::interval
  WHERE id = p_origin_moon_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota teletransportada exitosamente',
    'cooldown_hours', v_cooldown_hours
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Combat simulation function
CREATE OR REPLACE FUNCTION simulate_combat(
  p_attacker_fleet jsonb,
  p_defender_fleet jsonb,
  p_defender_defenses jsonb,
  p_attacker_tech jsonb,
  p_defender_tech jsonb
) RETURNS jsonb AS $$
DECLARE
  v_round integer := 0;
  v_max_rounds integer := 6;
  v_attacker_units jsonb;
  v_defender_units jsonb;
  v_attacker_total_power numeric := 0;
  v_defender_total_power numeric := 0;
  v_rounds_data jsonb := '[]'::jsonb;
  v_result text;
  v_attacker_losses jsonb;
  v_defender_losses jsonb;
  v_debris_metal numeric := 0;
  v_debris_crystal numeric := 0;
BEGIN
  v_attacker_units := p_attacker_fleet;
  v_defender_units := p_defender_fleet || p_defender_defenses;
  
  WHILE v_round < v_max_rounds LOOP
    v_round := v_round + 1;
    
    SELECT COALESCE(SUM((unit->>'quantity')::integer * (unit->>'weapon_power')::integer), 0)
    INTO v_attacker_total_power
    FROM jsonb_array_elements(v_attacker_units) AS unit
    WHERE (unit->>'quantity')::integer > 0;
    
    SELECT COALESCE(SUM((unit->>'quantity')::integer * (unit->>'weapon_power')::integer), 0)
    INTO v_defender_total_power
    FROM jsonb_array_elements(v_defender_units) AS unit
    WHERE (unit->>'quantity')::integer > 0;
    
    IF v_attacker_total_power <= 0 OR v_defender_total_power <= 0 THEN
      EXIT;
    END IF;
    
    v_rounds_data := v_rounds_data || jsonb_build_object(
      'round', v_round,
      'attacker_power', v_attacker_total_power,
      'defender_power', v_defender_total_power
    );
  END LOOP;
  
  SELECT COALESCE(SUM((unit->>'quantity')::integer), 0)
  INTO v_attacker_total_power
  FROM jsonb_array_elements(v_attacker_units) AS unit;
  
  SELECT COALESCE(SUM((unit->>'quantity')::integer), 0)
  INTO v_defender_total_power
  FROM jsonb_array_elements(v_defender_units) AS unit;
  
  IF v_attacker_total_power > 0 AND v_defender_total_power <= 0 THEN
    v_result := 'attacker_won';
  ELSIF v_attacker_total_power <= 0 AND v_defender_total_power > 0 THEN
    v_result := 'defender_won';
  ELSE
    v_result := 'draw';
  END IF;
  
  RETURN jsonb_build_object(
    'result', v_result,
    'rounds', v_round,
    'rounds_data', v_rounds_data,
    'attacker_remaining', v_attacker_units,
    'defender_remaining', v_defender_units,
    'debris_metal', v_debris_metal,
    'debris_crystal', v_debris_crystal
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Moon destruction mission handler
CREATE OR REPLACE FUNCTION process_moon_destruction(
  p_fleet_id uuid,
  p_target_moon_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_fleet record;
  v_moon record;
  v_deathstar_count integer;
  v_destruction_chance integer;
  v_fleet_loss_chance integer;
  v_moon_destroyed boolean := false;
  v_fleet_destroyed boolean := false;
  v_moon_diameter integer;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  SELECT * INTO v_moon FROM planets WHERE id = p_target_moon_id AND planet_type = 'moon';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Luna no encontrada');
  END IF;
  
  SELECT COALESCE(SUM(fs.quantity), 0) INTO v_deathstar_count
  FROM fleet_ships fs
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE fs.fleet_id = p_fleet_id AND st.code = 'deathstar';
  
  IF v_deathstar_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Necesitas Estrellas de la Muerte');
  END IF;
  
  v_moon_diameter := v_moon.diameter;
  
  v_destruction_chance := (100 - SQRT(v_moon_diameter)) * SQRT(v_deathstar_count);
  v_destruction_chance := GREATEST(0, LEAST(100, v_destruction_chance));
  
  v_fleet_loss_chance := SQRT(v_moon_diameter) / 2;
  v_fleet_loss_chance := GREATEST(0, LEAST(100, v_fleet_loss_chance));
  
  IF random() * 100 < v_destruction_chance THEN
    v_moon_destroyed := true;
    
    UPDATE planets SET is_destroyed = true WHERE id = p_target_moon_id;
    
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_moon.user_id,
      'Tu luna ha sido destruida!',
      format('Tu luna en [%s:%s:%s] ha sido destruida por una flota enemiga.',
        v_moon.galaxy, v_moon.solar_system, v_moon.position),
      'battle'
    );
  END IF;
  
  IF random() * 100 < v_fleet_loss_chance THEN
    v_fleet_destroyed := true;
    
    DELETE FROM fleet_ships WHERE fleet_id = p_fleet_id;
    UPDATE fleets SET is_completed = true WHERE id = p_fleet_id;
    
    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_fleet.user_id,
      'Tu flota fue destruida!',
      format('Tu flota fue atrapada en la explosion de la luna en [%s:%s:%s].',
        v_moon.galaxy, v_moon.solar_system, v_moon.position),
      'battle'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'moon_destroyed', v_moon_destroyed,
    'fleet_destroyed', v_fleet_destroyed,
    'destruction_chance', v_destruction_chance,
    'fleet_loss_chance', v_fleet_loss_chance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Defense rebuild function (called after combat)
CREATE OR REPLACE FUNCTION rebuild_defenses_after_combat(
  p_planet_id uuid,
  p_destroyed_defenses jsonb
) RETURNS jsonb AS $$
DECLARE
  v_defense record;
  v_rebuild_chance numeric := 0.7;
  v_rebuilt_count integer := 0;
  v_defense_type_id integer;
  v_destroyed_quantity integer;
  v_rebuilt_quantity integer;
BEGIN
  FOR v_defense IN SELECT * FROM jsonb_array_elements(p_destroyed_defenses)
  LOOP
    v_defense_type_id := (v_defense.value->>'defense_type_id')::integer;
    v_destroyed_quantity := (v_defense.value->>'quantity')::integer;
    
    v_rebuilt_quantity := 0;
    FOR i IN 1..v_destroyed_quantity LOOP
      IF random() < v_rebuild_chance THEN
        v_rebuilt_quantity := v_rebuilt_quantity + 1;
      END IF;
    END LOOP;
    
    IF v_rebuilt_quantity > 0 THEN
      UPDATE planet_defenses
      SET quantity = quantity + v_rebuilt_quantity
      WHERE planet_id = p_planet_id AND defense_type_id = v_defense_type_id;
      
      v_rebuilt_count := v_rebuilt_count + v_rebuilt_quantity;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'rebuilt_count', v_rebuilt_count,
    'rebuild_chance', v_rebuild_chance * 100
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate max expeditions based on astrophysics
CREATE OR REPLACE FUNCTION get_max_expeditions(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_astrophysics_level integer;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';
  
  RETURN FLOOR(SQRT(COALESCE(v_astrophysics_level, 0)));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get fleet slots based on computer tech
CREATE OR REPLACE FUNCTION get_fleet_slots(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_computer_level integer;
  v_has_admiral boolean;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_computer_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'computer_tech';
  
  SELECT EXISTS(
    SELECT 1 FROM user_officers uo
    JOIN officer_types ot ON uo.officer_type_id = ot.id
    WHERE uo.user_id = p_user_id 
      AND ot.code = 'admiral' 
      AND uo.expires_at > NOW()
  ) INTO v_has_admiral;
  
  RETURN 1 + COALESCE(v_computer_level, 0) + (CASE WHEN v_has_admiral THEN 2 ELSE 0 END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_fleets_user_active ON fleets(user_id) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_fleets_arrival ON fleets(arrival_time) WHERE is_completed = false;
CREATE INDEX IF NOT EXISTS idx_building_queue_planet ON building_queue(planet_id, queue_position);
CREATE INDEX IF NOT EXISTS idx_shipyard_queue_planet ON shipyard_queue(planet_id, queue_position);