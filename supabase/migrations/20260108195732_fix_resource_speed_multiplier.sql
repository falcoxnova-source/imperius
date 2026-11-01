/*
  # Fix Resource Speed Multiplier

  ## Problem
  The `calculate_planet_resources` function was not applying the `resource_speed` 
  multiplier from admin settings, so changing speed in admin panel had no effect.

  ## Solution
  - Update `calculate_planet_resources` to read `get_resource_speed()` 
  - Apply multiplier to production rates
  - Production per hour now reflects the server speed setting
*/

-- Update calculate_planet_resources to apply resource_speed multiplier
CREATE OR REPLACE FUNCTION calculate_planet_resources(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet RECORD;
  v_resources RECORD;
  v_user_id uuid;
  v_officer_bonuses jsonb;
  v_resource_speed integer;
  
  v_metal_mine_level int := 0;
  v_crystal_mine_level int := 0;
  v_deuterium_synth_level int := 0;
  v_solar_plant_level int := 0;
  v_fusion_reactor_level int := 0;
  v_metal_storage_level int := 0;
  v_crystal_storage_level int := 0;
  v_deuterium_tank_level int := 0;
  
  v_energy_tech_level int := 0;
  v_solar_satellites int := 0;
  
  v_metal_energy_consumption numeric;
  v_crystal_energy_consumption numeric;
  v_deuterium_energy_consumption numeric;
  v_total_energy_consumption numeric;
  v_solar_plant_energy numeric;
  v_fusion_reactor_energy numeric;
  v_solar_satellite_energy numeric;
  v_total_energy_production numeric;
  v_energy_factor numeric;
  
  v_base_metal_production numeric;
  v_base_crystal_production numeric;
  v_base_deuterium_production numeric;
  v_fusion_consumption numeric;
  v_metal_production numeric;
  v_crystal_production numeric;
  v_deuterium_production numeric;
  
  v_metal_storage numeric;
  v_crystal_storage numeric;
  v_deuterium_storage numeric;
  
  v_elapsed_hours numeric;
  v_now timestamp with time zone := now();
  
  v_new_metal numeric;
  v_new_crystal numeric;
  v_new_deuterium numeric;
  
  v_mine_bonus numeric := 0;
  v_energy_bonus numeric := 0;
BEGIN
  -- Get resource speed from admin settings
  v_resource_speed := COALESCE(get_resource_speed(), 10);

  -- Get planet info
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;
  
  v_user_id := v_planet.user_id;
  
  -- Get current resources
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Resources not found');
  END IF;
  
  -- Calculate elapsed time
  v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - COALESCE(v_resources.last_update, v_now))) / 3600.0;
  
  -- Get officer bonuses
  v_officer_bonuses := get_user_officer_bonuses(v_user_id);
  v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
  v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);
  
  -- Get building levels
  SELECT COALESCE(pb.level, 0) INTO v_metal_mine_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_mine';
  v_metal_mine_level := COALESCE(v_metal_mine_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_crystal_mine_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_mine';
  v_crystal_mine_level := COALESCE(v_crystal_mine_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_deuterium_synth_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_synthesizer';
  v_deuterium_synth_level := COALESCE(v_deuterium_synth_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_solar_plant_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'solar_plant';
  v_solar_plant_level := COALESCE(v_solar_plant_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_fusion_reactor_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'fusion_reactor';
  v_fusion_reactor_level := COALESCE(v_fusion_reactor_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_metal_storage_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_storage';
  v_metal_storage_level := COALESCE(v_metal_storage_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_crystal_storage_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_storage';
  v_crystal_storage_level := COALESCE(v_crystal_storage_level, 0);
  
  SELECT COALESCE(pb.level, 0) INTO v_deuterium_tank_level
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_tank';
  v_deuterium_tank_level := COALESCE(v_deuterium_tank_level, 0);
  
  -- Get energy tech level
  SELECT COALESCE(ut.level, 0) INTO v_energy_tech_level
  FROM user_technologies ut
  JOIN technology_types tt ON tt.id = ut.technology_type_id
  WHERE ut.user_id = v_user_id AND tt.code = 'energy_tech';
  v_energy_tech_level := COALESCE(v_energy_tech_level, 0);
  
  -- Get solar satellites
  SELECT COALESCE(ps.quantity, 0) INTO v_solar_satellites
  FROM planet_ships ps
  JOIN ship_types st ON st.id = ps.ship_type_id
  WHERE ps.planet_id = p_planet_id AND st.code = 'solar_satellite';
  v_solar_satellites := COALESCE(v_solar_satellites, 0);
  
  -- Calculate energy consumption (XNova formulas)
  v_metal_energy_consumption := FLOOR(10 * v_metal_mine_level * POWER(1.1, v_metal_mine_level));
  v_crystal_energy_consumption := FLOOR(10 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level));
  v_deuterium_energy_consumption := FLOOR(20 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level));
  v_total_energy_consumption := v_metal_energy_consumption + v_crystal_energy_consumption + v_deuterium_energy_consumption;
  
  -- Calculate energy production
  v_solar_plant_energy := FLOOR(20 * v_solar_plant_level * POWER(1.1, v_solar_plant_level));
  v_fusion_reactor_energy := FLOOR(30 * v_fusion_reactor_level * POWER((1.05 + v_energy_tech_level * 0.01), v_fusion_reactor_level));
  v_solar_satellite_energy := FLOOR((v_planet.temp_max + 160) / 6.0) * v_solar_satellites;
  
  -- Apply energy bonus from officers
  v_solar_plant_energy := FLOOR(v_solar_plant_energy * (1 + v_energy_bonus));
  v_fusion_reactor_energy := FLOOR(v_fusion_reactor_energy * (1 + v_energy_bonus));
  v_solar_satellite_energy := FLOOR(v_solar_satellite_energy * (1 + v_energy_bonus));
  
  v_total_energy_production := v_solar_plant_energy + v_fusion_reactor_energy + v_solar_satellite_energy;
  
  -- Calculate energy factor
  IF v_total_energy_consumption > 0 THEN
    v_energy_factor := LEAST(1, v_total_energy_production / v_total_energy_consumption);
  ELSE
    v_energy_factor := 1;
  END IF;
  
  -- Calculate base production (XNova formulas)
  v_base_metal_production := FLOOR(30 * v_metal_mine_level * POWER(1.1, v_metal_mine_level));
  v_base_crystal_production := FLOOR(20 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level));
  v_base_deuterium_production := FLOOR(10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) * (1.36 - 0.004 * v_planet.temp_max));
  
  -- Apply mine bonus from officers
  v_base_metal_production := FLOOR(v_base_metal_production * (1 + v_mine_bonus));
  v_base_crystal_production := FLOOR(v_base_crystal_production * (1 + v_mine_bonus));
  v_base_deuterium_production := FLOOR(v_base_deuterium_production * (1 + v_mine_bonus));
  
  -- Subtract fusion reactor consumption
  v_fusion_consumption := FLOOR(10 * v_fusion_reactor_level * POWER(1.1, v_fusion_reactor_level));
  v_base_deuterium_production := v_base_deuterium_production - v_fusion_consumption;
  
  -- Apply energy factor
  v_metal_production := FLOOR(v_base_metal_production * v_energy_factor);
  v_crystal_production := FLOOR(v_base_crystal_production * v_energy_factor);
  v_deuterium_production := FLOOR(v_base_deuterium_production * v_energy_factor);
  
  -- Apply resource speed multiplier from admin settings
  v_metal_production := v_metal_production * v_resource_speed;
  v_crystal_production := v_crystal_production * v_resource_speed;
  v_deuterium_production := v_deuterium_production * v_resource_speed;
  
  -- Calculate storage capacity (XNova formula)
  v_metal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_metal_storage_level) / 33.0)));
  v_crystal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_crystal_storage_level) / 33.0)));
  v_deuterium_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_deuterium_tank_level) / 33.0)));
  
  -- If no time has passed, return current resources but with updated production rates
  IF v_elapsed_hours <= 0 THEN
    RETURN jsonb_build_object(
      'metal', v_resources.metal,
      'crystal', v_resources.crystal,
      'deuterium', v_resources.deuterium,
      'metal_per_hour', v_metal_production,
      'crystal_per_hour', v_crystal_production,
      'deuterium_per_hour', v_deuterium_production,
      'metal_storage', v_metal_storage,
      'crystal_storage', v_crystal_storage,
      'deuterium_storage', v_deuterium_storage,
      'energy_used', v_total_energy_consumption,
      'energy_max', v_total_energy_production,
      'last_update', v_resources.last_update
    );
  END IF;
  
  -- Calculate new resources
  v_new_metal := LEAST(v_metal_storage, GREATEST(0, v_resources.metal + v_metal_production * v_elapsed_hours));
  v_new_crystal := LEAST(v_crystal_storage, GREATEST(0, v_resources.crystal + v_crystal_production * v_elapsed_hours));
  v_new_deuterium := LEAST(v_deuterium_storage, GREATEST(0, v_resources.deuterium + v_deuterium_production * v_elapsed_hours));
  
  RETURN jsonb_build_object(
    'metal', FLOOR(v_new_metal),
    'crystal', FLOOR(v_new_crystal),
    'deuterium', FLOOR(v_new_deuterium),
    'metal_per_hour', v_metal_production,
    'crystal_per_hour', v_crystal_production,
    'deuterium_per_hour', v_deuterium_production,
    'metal_storage', v_metal_storage,
    'crystal_storage', v_crystal_storage,
    'deuterium_storage', v_deuterium_storage,
    'energy_used', v_total_energy_consumption,
    'energy_max', v_total_energy_production,
    'last_update', v_resources.last_update,
    'calculated_at', v_now
  );
END;
$$;
