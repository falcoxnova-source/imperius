/*
  # Sistema de Agotamiento de Recursos Planetarios
  
  ## Reglas
  - Planeta principal (is_main_planet = true): depósitos NULL = infinito, NUNCA se agota
  - Colonias: depósitos finitos calculados según campos × factor por posición solar
  - Al agotarse: producción cae al 5%, planet_status = 'depleted'
  - Al abandonar planeta agotado: planet_status = 'regenerating', regenerates_at = now() + 30 días
  - Tras regeneración: nuevos depósitos aleatorios, planet_status = 'active', colonizable
  
  ## Columnas nuevas (sin renombrar nada existente)
  - metal_deposit, crystal_deposit, deuterium_deposit
  - planet_status, depleted_at, regenerates_at
*/

-- ============================================================================
-- 1. NUEVAS COLUMNAS EN planets
-- ============================================================================
ALTER TABLE planets 
  ADD COLUMN IF NOT EXISTS metal_deposit bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS crystal_deposit bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deuterium_deposit bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS planet_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS depleted_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS regenerates_at timestamptz DEFAULT NULL;

-- Índices para búsquedas del cron
CREATE INDEX IF NOT EXISTS idx_planets_status ON planets(planet_status) WHERE planet_status != 'active';
CREATE INDEX IF NOT EXISTS idx_planets_regenerates ON planets(regenerates_at) WHERE planet_status = 'regenerating';

-- ============================================================================
-- 2. GAME SETTINGS
-- ============================================================================
INSERT INTO game_settings (key, value, description)
VALUES 
  ('depletion_enabled', 'true', 'Enable/disable resource depletion on colonies'),
  ('depletion_regeneration_days', '30', 'Days before a depleted abandoned planet regenerates'),
  ('depletion_base_metal_per_field', '40000', 'Base metal deposit per field slot (× position factor)'),
  ('depletion_depleted_production_percent', '5', 'Production percentage when planet is depleted'),
  ('depletion_energy_bonus_percent', '20', 'Solar energy bonus for positions 1-3'),
  ('depletion_pos_1_3_metal', '1.5', 'Metal multiplier for positions 1-3'),
  ('depletion_pos_1_3_crystal', '1.1', 'Crystal multiplier for positions 1-3'),
  ('depletion_pos_1_3_deuterium', '0.2', 'Deuterium multiplier for positions 1-3'),
  ('depletion_pos_4_6_metal', '1.3', 'Metal multiplier for positions 4-6'),
  ('depletion_pos_4_6_crystal', '1.2', 'Crystal multiplier for positions 4-6'),
  ('depletion_pos_4_6_deuterium', '0.5', 'Deuterium multiplier for positions 4-6'),
  ('depletion_pos_7_9_metal', '1.0', 'Metal multiplier for positions 7-9'),
  ('depletion_pos_7_9_crystal', '1.0', 'Crystal multiplier for positions 7-9'),
  ('depletion_pos_7_9_deuterium', '1.0', 'Deuterium multiplier for positions 7-9'),
  ('depletion_pos_10_12_metal', '0.7', 'Metal multiplier for positions 10-12'),
  ('depletion_pos_10_12_crystal', '0.8', 'Crystal multiplier for positions 10-12'),
  ('depletion_pos_10_12_deuterium', '1.4', 'Deuterium multiplier for positions 10-12'),
  ('depletion_pos_13_15_metal', '0.3', 'Metal multiplier for positions 13-15'),
  ('depletion_pos_13_15_crystal', '0.5', 'Crystal multiplier for positions 13-15'),
  ('depletion_pos_13_15_deuterium', '2.0', 'Deuterium multiplier for positions 13-15')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 3. FUNCIÓN PARA OBTENER FACTORES POR POSICIÓN
-- ============================================================================
CREATE OR REPLACE FUNCTION get_deposit_position_factors(p_position integer)
RETURNS TABLE(metal_factor numeric, crystal_factor numeric, deuterium_factor numeric)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  CASE
    WHEN p_position BETWEEN 1 AND 3 THEN
      metal_factor := 1.5; crystal_factor := 1.1; deuterium_factor := 0.2;
    WHEN p_position BETWEEN 4 AND 6 THEN
      metal_factor := 1.3; crystal_factor := 1.2; deuterium_factor := 0.5;
    WHEN p_position BETWEEN 7 AND 9 THEN
      metal_factor := 1.0; crystal_factor := 1.0; deuterium_factor := 1.0;
    WHEN p_position BETWEEN 10 AND 12 THEN
      metal_factor := 0.7; crystal_factor := 0.8; deuterium_factor := 1.4;
    WHEN p_position BETWEEN 13 AND 15 THEN
      metal_factor := 0.3; crystal_factor := 0.5; deuterium_factor := 2.0;
    ELSE
      metal_factor := 1.0; crystal_factor := 1.0; deuterium_factor := 1.0;
  END CASE;
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 4. FUNCIÓN PARA CALCULAR DEPÓSITOS INICIALES
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_initial_deposits(
  p_fields integer,
  p_position integer,
  p_base_metal_per_field numeric DEFAULT 40000
)
RETURNS TABLE(metal_deposit bigint, crystal_deposit bigint, deuterium_deposit bigint)
LANGUAGE plpgsql AS $$
DECLARE
  v_factors RECORD;
  v_base numeric;
  v_random_factor numeric;
BEGIN
  SELECT * INTO v_factors FROM get_deposit_position_factors(p_position);
  
  -- Random factor 0.8-1.2 for variety
  v_random_factor := 0.8 + random() * 0.4;
  
  v_base := p_fields * p_base_metal_per_field * v_random_factor;
  
  metal_deposit := GREATEST(100000, FLOOR(v_base * v_factors.metal_factor))::bigint;
  crystal_deposit := GREATEST(50000, FLOOR(v_base * 0.5 * v_factors.crystal_factor))::bigint;
  deuterium_deposit := GREATEST(25000, FLOOR(v_base * 0.25 * v_factors.deuterium_factor))::bigint;
  
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 5. ACTUALIZAR calculate_planet_resources() PARA SOPORTAR DEPÓSITOS
-- ============================================================================
-- Patcheamos la función existente añadiendo lógica de depósitos al final
-- (antes del RETURN final). Buscamos el punto de inserción y añadimos la lógica.

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

  -- ⚡ DEPLETION variables
  v_is_main boolean;
  v_production_factor numeric := 1.0;
  v_metal_available numeric;
  v_crystal_available numeric;
  v_deuterium_available numeric;
BEGIN
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

  -- ⚡ DEPLETION: Check if planet is depleted
  IF v_planet.planet_status = 'depleted' THEN
    -- Get depleted production percent from settings
    v_production_factor := 0.05; -- default 5%
    BEGIN
      v_production_factor := COALESCE(
        (SELECT value::numeric / 100.0 FROM game_settings WHERE key = 'depletion_depleted_production_percent'),
        0.05
      );
    EXCEPTION WHEN OTHERS THEN
      v_production_factor := 0.05;
    END;
  END IF;

  -- Apply depletion factor
  v_metal_production := v_metal_production * v_production_factor;
  v_crystal_production := v_crystal_production * v_production_factor;
  v_deuterium_production := v_deuterium_production * v_production_factor;

  -- Convert to hourly production from per-hour base
  v_new_metal := v_resources.metal + (v_metal_production * v_elapsed_hours);
  v_new_crystal := v_resources.crystal + (v_crystal_production * v_elapsed_hours);
  v_new_deuterium := v_resources.deuterium + (v_deuterium_production * v_elapsed_hours);

  -- ⚡ DEPLETION: Deduct from deposits (only for colonies, not main planet)
  IF NOT v_is_main AND (SELECT COALESCE((SELECT value::boolean FROM game_settings WHERE key = 'depletion_enabled'), true)) THEN
    -- Calculate how much was actually produced
    v_metal_available := COALESCE(v_planet.metal_deposit, 0);
    v_crystal_available := COALESCE(v_planet.crystal_deposit, 0);
    v_deuterium_available := COALESCE(v_planet.deuterium_deposit, 0);
    
    -- Deduct only elapsed production (not base resources)
    IF v_metal_available > 0 AND v_metal_available != 9223372036854775807 THEN -- not max bigint
      v_metal_available := v_metal_available - (v_metal_production * v_elapsed_hours);
      IF v_metal_available <= 0 THEN v_metal_available := 0; END IF;
    END IF;
    
    IF v_crystal_available > 0 AND v_crystal_available != 9223372036854775807 THEN
      v_crystal_available := v_crystal_available - (v_crystal_production * v_elapsed_hours);
      IF v_crystal_available <= 0 THEN v_crystal_available := 0; END IF;
    END IF;
    
    IF v_deuterium_available > 0 AND v_deuterium_available != 9223372036854775807 THEN
      v_deuterium_available := v_deuterium_available - (v_deuterium_production * v_elapsed_hours);
      IF v_deuterium_available <= 0 THEN v_deuterium_available := 0; END IF;
    END IF;
    
    -- Update deposits in DB
    UPDATE planets SET 
      metal_deposit = CASE WHEN metal_deposit IS NULL THEN NULL ELSE v_metal_available::bigint END,
      crystal_deposit = CASE WHEN crystal_deposit IS NULL THEN NULL ELSE v_crystal_available::bigint END,
      deuterium_deposit = CASE WHEN deuterium_deposit IS NULL THEN NULL ELSE v_deuterium_available::bigint END
    WHERE id = p_planet_id;
    
    -- Check if planet is now depleted
    IF (v_metal_available <= 0 AND v_crystal_available <= 0 AND v_deuterium_available <= 0) THEN
      IF v_planet.planet_status != 'depleted' THEN
        UPDATE planets SET planet_status = 'depleted', depleted_at = now() WHERE id = p_planet_id;
      END IF;
    END IF;
  END IF;

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

-- ============================================================================
-- 6. ACTUALIZAR calculate_colony_stats() PARA INCLUIR DEPÓSITOS
-- ============================================================================
DROP FUNCTION IF EXISTS calculate_colony_stats(integer);
CREATE OR REPLACE FUNCTION calculate_colony_stats(p_position integer)
RETURNS TABLE (
  temp_min integer,
  temp_max integer,
  fields_min integer,
  fields_max integer,
  metal_deposit bigint,
  crystal_deposit bigint,
  deuterium_deposit bigint
)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_fields integer;
  v_base_metal_per_field numeric;
  v_deposits RECORD;
BEGIN
  SELECT COALESCE(value::numeric, 40000) INTO v_base_metal_per_field
  FROM game_settings WHERE key = 'depletion_base_metal_per_field';

  CASE
    WHEN p_position BETWEEN 1 AND 3 THEN
      temp_min := 100 + (4 - p_position) * 20 + floor(random() * 20)::integer;
      temp_max := temp_min + 30 + floor(random() * 20)::integer;
      fields_min := 95;
      fields_max := 140;
    WHEN p_position BETWEEN 4 AND 6 THEN
      temp_min := 30 + floor(random() * 30)::integer;
      temp_max := temp_min + 30 + floor(random() * 20)::integer;
      fields_min := 140;
      fields_max := 200;
    WHEN p_position BETWEEN 7 AND 9 THEN
      temp_min := -10 + floor(random() * 40)::integer;
      temp_max := temp_min + 30 + floor(random() * 20)::integer;
      fields_min := 180;
      fields_max := 250;
    WHEN p_position BETWEEN 10 AND 12 THEN
      temp_min := -50 + floor(random() * 30)::integer;
      temp_max := temp_min + 25 + floor(random() * 15)::integer;
      fields_min := 140;
      fields_max := 200;
    WHEN p_position BETWEEN 13 AND 15 THEN
      temp_min := -120 + (p_position - 12) * (-10) + floor(random() * 20)::integer;
      temp_max := temp_min + 20 + floor(random() * 10)::integer;
      fields_min := 95;
      fields_max := 150;
    ELSE
      temp_min := 0;
      temp_max := 50;
      fields_min := 100;
      fields_max := 180;
  END CASE;
  
  -- Random field count within range
  v_fields := fields_min + floor(random() * (fields_max - fields_min + 1))::integer;
  
  -- Calculate deposits
  SELECT * INTO v_deposits FROM calculate_initial_deposits(v_fields, p_position, v_base_metal_per_field);
  metal_deposit := v_deposits.metal_deposit;
  crystal_deposit := v_deposits.crystal_deposit;
  deuterium_deposit := v_deposits.deuterium_deposit;
  
  -- Set min/max to actual field count for consistency
  fields_min := v_fields;
  fields_max := v_fields;
  
  RETURN NEXT;
END;
$$;

-- ============================================================================
-- 7. ACTUALIZAR process_fleet_arrival() - Pasamos depósitos al nuevo planeta
-- ============================================================================
-- Nota: El proceso de colonización en process_fleet_arrival usa calculate_colony_stats()
-- que ya retorna los depósitos. Buscamos la parte donde se INSERT en planets y
-- nos aseguramos de que las columnas de depósito se incluyan.
-- 
-- Esto se hará mediante un UPDATE post-INSERT para no modificar la lógica compleja
-- de process_fleet_arrival. Añadimos un trigger o modificamos la inserción.

-- En lugar de modificar process_fleet_arrival (función muy larga y compleja),
-- creamos un trigger que calcule depósitos al INSERTAR un planeta nuevo que no sea main.

CREATE OR REPLACE FUNCTION set_initial_deposits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deposits RECORD;
  v_base_metal numeric;
BEGIN
  -- Only set deposits for colonies (not main planet), and only if not already set
  IF NEW.is_main_planet = false AND NEW.metal_deposit IS NULL THEN
    SELECT COALESCE(value::numeric, 40000) INTO v_base_metal
    FROM game_settings WHERE key = 'depletion_base_metal_per_field';
    
    SELECT * INTO v_deposits FROM calculate_initial_deposits(
      NEW.fields_max, NEW.position, v_base_metal
    );
    
    NEW.metal_deposit := v_deposits.metal_deposit;
    NEW.crystal_deposit := v_deposits.crystal_deposit;
    NEW.deuterium_deposit := v_deposits.deuterium_deposit;
    NEW.planet_status := 'active';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Aplicar trigger solo si no existe
DROP TRIGGER IF EXISTS trg_set_initial_deposits ON planets;
CREATE TRIGGER trg_set_initial_deposits
  BEFORE INSERT ON planets
  FOR EACH ROW
  EXECUTE FUNCTION set_initial_deposits();

-- ============================================================================
-- 8. ACTUALIZAR secure_abandon_colony() - No borrar planetas agotados
-- ============================================================================
-- Modificamos la función existente para manejar planetas depleted.
-- Buscamos el punto después de verificar que no es main planet.
-- Si planet_status = 'depleted', en lugar de borrar, marcamos como regenerating.

CREATE OR REPLACE FUNCTION secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_fxu_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_active_fleet_count integer;
  v_building_queue_count integer;
  v_shipyard_queue_count integer;
  v_research_on_planet boolean;
  v_regeneration_days integer;
BEGIN
  -- Authentication check
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Vacation mode check
  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  -- Validate planet ownership
  SELECT * INTO v_planet
  FROM planets
  WHERE id = p_planet_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Cannot abandon homeworld
  IF v_planet.is_main_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  -- ⚡ DEPLETION: If planet is depleted, use depletion flow instead of destruction
  IF v_planet.planet_status = 'depleted' THEN
    SELECT COALESCE(value::integer, 30) INTO v_regeneration_days
    FROM game_settings WHERE key = 'depletion_regeneration_days';
    
    -- Clear planet ownership and mark for regeneration
    UPDATE planets SET
      user_id = NULL,
      planet_status = 'regenerating',
      regenerates_at = now() + (v_regeneration_days || ' days')::interval,
      updated_at = now()
    WHERE id = p_planet_id;
    
    -- Delete related data (buildings, ships, defenses, resources)
    DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
    DELETE FROM planet_ships WHERE planet_id = p_planet_id;
    DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
    DELETE FROM planet_resources WHERE planet_id = p_planet_id;
    DELETE FROM building_queue WHERE planet_id = p_planet_id;
    DELETE FROM shipyard_queue WHERE planet_id = p_planet_id;
    DELETE FROM supply_box_purchases WHERE planet_id = p_planet_id;
    
    -- Nullify references
    UPDATE fleets SET origin_planet_id = NULL WHERE origin_planet_id = p_planet_id;
    UPDATE fleets SET target_planet_id = NULL WHERE target_planet_id = p_planet_id;
    UPDATE market_listings SET planet_id = NULL WHERE planet_id = p_planet_id;
    UPDATE user_technologies SET research_planet_id = NULL WHERE research_planet_id = p_planet_id;
    UPDATE galaxy_positions SET occupied_by = NULL WHERE planet_id = p_planet_id;
    
    -- Reset fields
    UPDATE planets SET fields_used = 0 WHERE id = p_planet_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Colony abandoned. Planet will regenerate in ' || v_regeneration_days || ' days.',
      'regenerates_at', now() + (v_regeneration_days || ' days')::interval
    );
  END IF;

  -- Check for active building queue on this planet
  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active building queue');
  END IF;

  -- Check for active shipyard queue
  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active shipyard queue');
  END IF;

  -- Check for research on this planet
  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE research_planet_id = p_planet_id AND is_researching = true
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active research');
  END IF;

  -- Check for active fleets from this planet
  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id AND arrival_time > now();

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active fleets');
  END IF;

  -- Get FXU fee
  SELECT COALESCE(value::numeric, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';

  -- Check FXU balance
  SELECT fxu_balance INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee || ' FXU');
  END IF;

  -- Deduct FXU
  PERFORM set_config('app.fxu_update_allowed', 'abandon_colony', true);
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  -- Pay admin
  SELECT get_admin_account_id() INTO v_admin_id;
  IF v_admin_id IS NOT NULL AND v_admin_id != auth.uid() THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  -- Delete planet (cascading)
  DELETE FROM planets WHERE id = p_planet_id;

  RETURN jsonb_build_object('success', true, 'message', 'Colony destroyed successfully');
END;
$$;

-- ============================================================================
-- 9. FUNCIÓN DE REGENERACIÓN (para cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION regenerate_depleted_planets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet RECORD;
  v_count integer := 0;
  v_deposits RECORD;
  v_base_metal numeric;
BEGIN
  SELECT COALESCE(value::numeric, 40000) INTO v_base_metal
  FROM game_settings WHERE key = 'depletion_base_metal_per_field';

  FOR v_planet IN
    SELECT * FROM planets 
    WHERE planet_status = 'regenerating' 
      AND regenerates_at IS NOT NULL 
      AND regenerates_at <= now()
      AND user_id IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Recalculate deposits with fresh random values
    SELECT * INTO v_deposits FROM calculate_initial_deposits(
      v_planet.fields_max, v_planet.position, v_base_metal
    );
    
    UPDATE planets SET
      metal_deposit = v_deposits.metal_deposit,
      crystal_deposit = v_deposits.crystal_deposit,
      deuterium_deposit = v_deposits.deuterium_deposit,
      planet_status = 'active',
      depleted_at = NULL,
      regenerates_at = NULL,
      updated_at = now()
    WHERE id = v_planet.id;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object('success', true, 'regenerated_count', v_count);
END;
$$;

-- ============================================================================
-- 10. RPCs PARA ADMIN Y UI
-- ============================================================================

-- Obtener depósitos de un planeta (para UI del jugador)
CREATE OR REPLACE FUNCTION get_planet_deposits(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet RECORD;
  v_result jsonb;
BEGIN
  SELECT id, is_main_planet, planet_status,
         metal_deposit, crystal_deposit, deuterium_deposit,
         depleted_at, regenerates_at,
         fields_max, fields_used, position
  INTO v_planet
  FROM planets WHERE id = p_planet_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found');
  END IF;
  
  v_result := jsonb_build_object(
    'success', true,
    'is_main_planet', v_planet.is_main_planet,
    'planet_status', v_planet.planet_status,
    'metal_deposit', v_planet.metal_deposit,
    'crystal_deposit', v_planet.crystal_deposit,
    'deuterium_deposit', v_planet.deuterium_deposit,
    'metal_deposit_pct', CASE WHEN v_planet.metal_deposit IS NOT NULL AND v_planet.metal_deposit > 0 
      THEN 100.0 ELSE NULL END,
    'crystal_deposit_pct', CASE WHEN v_planet.crystal_deposit IS NOT NULL AND v_planet.crystal_deposit > 0 
      THEN 100.0 ELSE NULL END,
    'deuterium_deposit_pct', CASE WHEN v_planet.deuterium_deposit IS NOT NULL AND v_planet.deuterium_deposit > 0 
      THEN 100.0 ELSE NULL END,
    'depleted_at', v_planet.depleted_at,
    'regenerates_at', v_planet.regenerates_at,
    'position', v_planet.position
  );
  
  -- Calculate actual percentages from the deposits
  IF v_planet.metal_deposit IS NOT NULL AND v_planet.metal_deposit > 0 THEN
    -- Get initial deposit estimate from fields and position for percentage
    DECLARE
      v_factors RECORD;
      v_base numeric;
      v_initial_metal bigint;
    BEGIN
      SELECT * INTO v_factors FROM get_deposit_position_factors(v_planet.position);
      SELECT COALESCE(value::numeric, 40000) INTO v_base FROM game_settings WHERE key = 'depletion_base_metal_per_field';
      v_initial_metal := GREATEST(100000, FLOOR(v_planet.fields_max * v_base * v_factors.metal_factor))::bigint;
      
      IF v_initial_metal > 0 THEN
        v_result := jsonb_set(v_result, '{metal_deposit_pct}', 
          to_jsonb(ROUND((v_planet.metal_deposit::numeric / v_initial_metal::numeric) * 100, 1)));
        v_result := jsonb_set(v_result, '{metal_initial}', to_jsonb(v_initial_metal));
      END IF;
    END;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Admin: obtener configuración de agotamiento
CREATE OR REPLACE FUNCTION admin_get_depletion_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depleted_count integer;
  v_regenerating_count integer;
BEGIN
  SELECT COUNT(*) INTO v_depleted_count FROM planets WHERE planet_status = 'depleted';
  SELECT COUNT(*) INTO v_regenerating_count FROM planets WHERE planet_status = 'regenerating';
  
  RETURN jsonb_build_object(
    'success', true,
    'depleted_planets', v_depleted_count,
    'regenerating_planets', v_regenerating_count,
    'settings', (
      SELECT jsonb_object_agg(key, value) 
      FROM game_settings 
      WHERE key LIKE 'depletion_%'
    )
  );
END;
$$;

-- Admin: actualizar configuración de agotamiento
CREATE OR REPLACE FUNCTION admin_update_depletion_settings(
  p_settings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_value text;
BEGIN
  -- Only admin can do this
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Update each setting
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_settings)
  LOOP
    IF v_key LIKE 'depletion_%' THEN
      INSERT INTO game_settings (key, value, description)
      VALUES (v_key, v_value, 'Depletion system setting')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Admin: forzar regeneración de todos los planetas pendientes
CREATE OR REPLACE FUNCTION admin_force_regenerate_planets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  RETURN regenerate_depleted_planets();
END;
$$;

-- Admin: listar planetas agotados/en regeneración
CREATE OR REPLACE FUNCTION admin_get_depleted_planets(
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'planets', (
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT p.id, p.galaxy, p.solar_system, p.position, p.planet_status,
               p.fields_max, p.fields_used, p.metal_deposit, p.crystal_deposit, 
               p.deuterium_deposit, p.depleted_at, p.regenerates_at,
               pr.username as owner_name
        FROM planets p
        LEFT JOIN profiles pr ON pr.id = p.user_id
        WHERE (p_status IS NULL OR p.planet_status = p_status)
          AND p.planet_status IN ('depleted', 'regenerating')
        ORDER BY p.depleted_at DESC NULLS LAST, p.regenerates_at ASC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    'total', (
      SELECT COUNT(*) FROM planets 
      WHERE (p_status IS NULL OR planet_status = p_status)
        AND planet_status IN ('depleted', 'regenerating')
    )
  );
END;
$$;

-- ============================================================================
-- 11. PERMISOS
-- ============================================================================
GRANT EXECUTE ON FUNCTION calculate_initial_deposits(integer, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION get_deposit_position_factors(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_planet_deposits(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_depletion_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_depletion_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_force_regenerate_planets() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_depleted_planets(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION regenerate_depleted_planets() TO authenticated;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload';
