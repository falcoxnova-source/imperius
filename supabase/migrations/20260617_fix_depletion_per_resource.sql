/*
  # Fix: Stop per-resource production when deposit hits 0 + resource_speed multiplier

  - Per-resource depletion: each resource stops independently
  - resource_speed multiplier preserved (x1, x10, x100)
*/

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
  
  -- Building levels
  v_metal_mine_level int := 0;
  v_crystal_mine_level int := 0;
  v_deuterium_synth_level int := 0;
  v_solar_plant_level int := 0;
  v_fusion_reactor_level int := 0;
  v_metal_storage_level int := 0;
  v_crystal_storage_level int := 0;
  v_deuterium_tank_level int := 0;
  
  -- Technology levels
  v_energy_tech_level int := 0;
  
  -- Ships
  v_solar_satellites int := 0;
  
  -- Energy calculations
  v_metal_energy_consumption numeric;
  v_crystal_energy_consumption numeric;
  v_deuterium_energy_consumption numeric;
  v_total_energy_consumption numeric;
  v_solar_plant_energy numeric;
  v_fusion_reactor_energy numeric;
  v_solar_satellite_energy numeric;
  v_total_energy_production numeric;
  v_energy_factor numeric;
  
  -- Production calculations
  v_base_metal_production numeric;
  v_base_crystal_production numeric;
  v_base_deuterium_production numeric;
  v_fusion_consumption numeric;
  v_metal_production numeric;
  v_crystal_production numeric;
  v_deuterium_production numeric;
  
  -- Storage calculations
  v_metal_storage numeric;
  v_crystal_storage numeric;
  v_deuterium_storage numeric;
  
  -- Time calculations
  v_elapsed_hours numeric;
  v_now timestamp with time zone := now();
  
  -- Final resources
  v_new_metal numeric;
  v_new_crystal numeric;
  v_new_deuterium numeric;
  
  -- Officer bonus multipliers
  v_mine_bonus numeric := 0;
  v_energy_bonus numeric := 0;

  -- SPEED multiplier
  v_resource_speed integer;

  -- DEPLETION variables
  v_is_main boolean;
  v_depletion_enabled boolean := true;
  v_metal_available numeric;
  v_crystal_available numeric;
  v_deuterium_available numeric;
  v_metal_would_produce numeric;
  v_crystal_would_produce numeric;
  v_deuterium_would_produce numeric;
  v_all_depleted boolean := false;
BEGIN
  v_resource_speed := COALESCE(get_resource_speed(), 10);

  -- Get planet info
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;
  
  v_user_id := v_planet.user_id;
  v_is_main := v_planet.is_main_planet;
  
  -- Get current resources
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Resources not found');
  END IF;
  
  -- Calculate elapsed time
  IF v_resources.last_update IS NOT NULL THEN
    v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_resources.last_update)) / 3600.0;
  ELSE
    v_elapsed_hours := 0;
  END IF;

  -- Cap at 48 hours to prevent extreme accumulation
  IF v_elapsed_hours > 48 THEN
    v_elapsed_hours := 48;
  END IF;
  
  -- Get officer bonuses
  IF v_user_id IS NOT NULL THEN
    v_officer_bonuses := get_user_officer_bonuses(v_user_id);
    v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
    v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);
  END IF;
  
  -- Get building levels
  SELECT COALESCE(MAX(pb.level), 0) INTO v_metal_mine_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_mine';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_crystal_mine_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_mine';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_deuterium_synth_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_synthesizer';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_solar_plant_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'solar_plant';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_fusion_reactor_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'fusion_reactor';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_metal_storage_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_storage';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_crystal_storage_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_storage';
  
  SELECT COALESCE(MAX(pb.level), 0) INTO v_deuterium_tank_level
  FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_tank';
  
  -- Get solar satellites
  SELECT COALESCE(SUM(ps.quantity), 0) INTO v_solar_satellites
  FROM planet_ships ps JOIN ship_types st ON st.id = ps.ship_type_id
  WHERE ps.planet_id = p_planet_id AND st.code = 'solar_satellite';
  
  -- Get technology levels
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(MAX(ut.level), 0) INTO v_energy_tech_level
    FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = v_user_id AND tt.code = 'energy_technology';
  END IF;
  
  -- Production calculations
  v_base_metal_production := 30 * v_metal_mine_level * POWER(1.1, v_metal_mine_level);
  v_base_crystal_production := 20 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level);
  v_base_deuterium_production := 10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) 
                                 * (1.36 - 0.004 * COALESCE(v_planet.temp_max, 40));
  
  -- Energy consumption
  v_metal_energy_consumption := 10 * v_metal_mine_level * POWER(1.1, v_metal_mine_level);
  v_crystal_energy_consumption := 10 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level);
  v_deuterium_energy_consumption := 10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level);
  v_total_energy_consumption := v_metal_energy_consumption + v_crystal_energy_consumption + v_deuterium_energy_consumption;
  
  -- Energy production
  v_solar_plant_energy := 20 * v_solar_plant_level * POWER(1.1, v_solar_plant_level);
  v_fusion_reactor_energy := 30 * v_fusion_reactor_level * POWER(1.1, v_fusion_reactor_level);
  v_solar_satellite_energy := 20 * v_solar_satellites * (1 + v_energy_tech_level * 0.05);
  v_total_energy_production := v_solar_plant_energy + v_fusion_reactor_energy + v_solar_satellite_energy;
  
  -- Apply energy bonus
  IF v_energy_bonus > 0 THEN
    v_total_energy_production := v_total_energy_production * (1 + v_energy_bonus);
  END IF;
  
  -- Energy factor
  IF v_total_energy_consumption > 0 THEN
    v_energy_factor := LEAST(1.0, v_total_energy_production / v_total_energy_consumption);
  ELSE
    v_energy_factor := 1.0;
  END IF;
  
  -- Apply energy factor to production
  v_metal_production := v_base_metal_production * v_energy_factor;
  v_crystal_production := v_base_crystal_production * v_energy_factor;
  v_deuterium_production := v_base_deuterium_production * v_energy_factor;
  
  -- Apply mine bonus
  IF v_mine_bonus > 0 THEN
    v_metal_production := v_metal_production * (1 + v_mine_bonus);
    v_crystal_production := v_crystal_production * (1 + v_mine_bonus);
    v_deuterium_production := v_deuterium_production * (1 + v_mine_bonus);
  END IF;

  -- Apply resource speed multiplier (x1, x10, x100, etc.)
  v_metal_production := v_metal_production * v_resource_speed;
  v_crystal_production := v_crystal_production * v_resource_speed;
  v_deuterium_production := v_deuterium_production * v_resource_speed;

  -- ========================================================================
  -- DEPLETION: Per-resource check BEFORE adding production to player resources
  -- ========================================================================
  BEGIN
    v_depletion_enabled := COALESCE(
      (SELECT value::boolean FROM game_settings WHERE key = 'depletion_enabled'),
      true
    );
  EXCEPTION WHEN OTHERS THEN
    v_depletion_enabled := true;
  END;

  IF NOT v_is_main AND v_depletion_enabled THEN
    v_metal_available := COALESCE(v_planet.metal_deposit, 0);
    v_crystal_available := COALESCE(v_planet.crystal_deposit, 0);
    v_deuterium_available := COALESCE(v_planet.deuterium_deposit, 0);
    
    -- Calculate how much would be produced in this period
    v_metal_would_produce := v_metal_production * v_elapsed_hours;
    v_crystal_would_produce := v_crystal_production * v_elapsed_hours;
    v_deuterium_would_produce := v_deuterium_production * v_elapsed_hours;
    
    -- METAL: cap production to remaining deposit
    IF v_metal_available <= 0 THEN
      v_metal_production := 0;
      v_metal_would_produce := 0;
    ELSIF v_metal_would_produce > v_metal_available THEN
      v_metal_would_produce := v_metal_available;
      v_metal_production := v_metal_available / GREATEST(v_elapsed_hours, 0.0001);
    END IF;
    
    -- CRYSTAL: cap production to remaining deposit
    IF v_crystal_available <= 0 THEN
      v_crystal_production := 0;
      v_crystal_would_produce := 0;
    ELSIF v_crystal_would_produce > v_crystal_available THEN
      v_crystal_would_produce := v_crystal_available;
      v_crystal_production := v_crystal_available / GREATEST(v_elapsed_hours, 0.0001);
    END IF;
    
    -- DEUTERIUM: cap production to remaining deposit
    IF v_deuterium_available <= 0 THEN
      v_deuterium_production := 0;
      v_deuterium_would_produce := 0;
    ELSIF v_deuterium_would_produce > v_deuterium_available THEN
      v_deuterium_would_produce := v_deuterium_available;
      v_deuterium_production := v_deuterium_available / GREATEST(v_elapsed_hours, 0.0001);
    END IF;
    
    -- Deduct from deposits
    v_metal_available := v_metal_available - v_metal_would_produce;
    v_crystal_available := v_crystal_available - v_crystal_would_produce;
    v_deuterium_available := v_deuterium_available - v_deuterium_would_produce;
    
    IF v_metal_available < 0 THEN v_metal_available := 0; END IF;
    IF v_crystal_available < 0 THEN v_crystal_available := 0; END IF;
    IF v_deuterium_available < 0 THEN v_deuterium_available := 0; END IF;
    
    -- Update deposits in DB
    UPDATE planets SET 
      metal_deposit = CASE WHEN metal_deposit IS NULL THEN NULL ELSE v_metal_available::bigint END,
      crystal_deposit = CASE WHEN crystal_deposit IS NULL THEN NULL ELSE v_crystal_available::bigint END,
      deuterium_deposit = CASE WHEN deuterium_deposit IS NULL THEN NULL ELSE v_deuterium_available::bigint END
    WHERE id = p_planet_id;
    
    -- Check if ALL deposits depleted
    IF v_metal_available <= 0 AND v_crystal_available <= 0 AND v_deuterium_available <= 0 THEN
      v_all_depleted := true;
      IF v_planet.planet_status != 'depleted' THEN
        UPDATE planets SET planet_status = 'depleted', depleted_at = now() WHERE id = p_planet_id;
      END IF;
    END IF;
  END IF;

  -- Convert to actual resource gain (already capped by deposit availability above)
  v_new_metal := v_resources.metal + (v_metal_production * v_elapsed_hours);
  v_new_crystal := v_resources.crystal + (v_crystal_production * v_elapsed_hours);
  v_new_deuterium := v_resources.deuterium + (v_deuterium_production * v_elapsed_hours);

  -- Cap at storage capacity
  v_metal_storage := 10000 * POWER(2, v_metal_storage_level);
  v_crystal_storage := 10000 * POWER(2, v_crystal_storage_level);
  v_deuterium_storage := 10000 * POWER(2, v_deuterium_tank_level);
  
  v_new_metal := LEAST(v_new_metal, v_metal_storage);
  v_new_crystal := LEAST(v_new_crystal, v_crystal_storage);
  v_new_deuterium := LEAST(v_new_deuterium, v_deuterium_storage);

  -- Update planet_resources
  UPDATE planet_resources SET
    metal = v_new_metal,
    crystal = v_new_crystal,
    deuterium = v_new_deuterium,
    metal_per_hour = v_metal_production,
    crystal_per_hour = v_crystal_production,
    deuterium_per_hour = v_deuterium_production,
    metal_storage = v_metal_storage,
    crystal_storage = v_crystal_storage,
    deuterium_storage = v_deuterium_storage,
    energy_used = v_total_energy_consumption,
    energy_max = v_total_energy_production,
    last_update = v_now
  WHERE planet_id = p_planet_id;

  -- Return resource data
  RETURN jsonb_build_object(
    'metal', v_new_metal,
    'crystal', v_new_crystal,
    'deuterium', v_new_deuterium,
    'metal_per_hour', v_metal_production,
    'crystal_per_hour', v_crystal_production,
    'deuterium_per_hour', v_deuterium_production,
    'metal_storage', v_metal_storage,
    'crystal_storage', v_crystal_storage,
    'deuterium_storage', v_deuterium_storage,
    'energy_used', v_total_energy_consumption,
    'energy_max', v_total_energy_production,
    'last_update', v_now
  );
END;
$$;
