const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();
  console.log('Connected');

  // ============================================================
  // UPDATE calculate_planet_resources to support production percentages
  // 
  // SURGICAL CHANGES (only 3 areas modified):
  // 1. Read 6 percentage columns from planet_resources (with COALESCE to 100)
  // 2. Apply % to energy consumption per mine (reduced mine = reduced energy use)
  // 3. Apply % to resource production per mine
  // 4. Apply % to energy producers (solar, fusion, satellites)
  // 5. Return the 6 percentage values in the jsonb output
  //
  // SAFETY: COALESCE(..., 100) ensures NULL or missing = 100% = no change
  // ============================================================

  const sql = `
CREATE OR REPLACE FUNCTION public.calculate_planet_resources(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_planet RECORD;
v_resources RECORD;
v_user_id uuid;
v_officer_bonuses jsonb;
v_resource_speed integer;
v_vacation_mode boolean;

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

-- Production percentages (0-100, default 100 via COALESCE)
v_metal_mine_pct numeric;
v_crystal_mine_pct numeric;
v_deut_synth_pct numeric;
v_solar_plant_pct numeric;
v_fusion_reactor_pct numeric;
v_solar_satellite_pct numeric;

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

v_solar_position_factor numeric;
BEGIN
v_resource_speed := COALESCE(get_resource_speed(), 10);

SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Planet not found');
END IF;

v_user_id := v_planet.user_id;

SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Resources not found');
END IF;

-- Read production percentages with COALESCE safety (100 = unchanged behavior)
v_metal_mine_pct := COALESCE(v_resources.metal_mine_percent, 100) / 100.0;
v_crystal_mine_pct := COALESCE(v_resources.crystal_mine_percent, 100) / 100.0;
v_deut_synth_pct := COALESCE(v_resources.deuterium_synth_percent, 100) / 100.0;
v_solar_plant_pct := COALESCE(v_resources.solar_plant_percent, 100) / 100.0;
v_fusion_reactor_pct := COALESCE(v_resources.fusion_reactor_percent, 100) / 100.0;
v_solar_satellite_pct := COALESCE(v_resources.solar_satellite_percent, 100) / 100.0;

-- Check vacation mode
SELECT COALESCE(vacation_mode, false) INTO v_vacation_mode
FROM profiles WHERE id = v_user_id;

-- If in vacation mode, return current resources with 0 production
IF v_vacation_mode THEN
RETURN jsonb_build_object(
'metal', v_resources.metal,
'crystal', v_resources.crystal,
'deuterium', v_resources.deuterium,
'metal_per_hour', 0,
'crystal_per_hour', 0,
'deuterium_per_hour', 0,
'metal_storage', v_resources.metal_storage,
'crystal_storage', v_resources.crystal_storage,
'deuterium_storage', v_resources.deuterium_storage,
'energy_used', v_resources.energy_used,
'energy_max', v_resources.energy_max,
'last_update', v_resources.last_update,
'metal_mine_percent', COALESCE(v_resources.metal_mine_percent, 100),
'crystal_mine_percent', COALESCE(v_resources.crystal_mine_percent, 100),
'deuterium_synth_percent', COALESCE(v_resources.deuterium_synth_percent, 100),
'solar_plant_percent', COALESCE(v_resources.solar_plant_percent, 100),
'fusion_reactor_percent', COALESCE(v_resources.fusion_reactor_percent, 100),
'solar_satellite_percent', COALESCE(v_resources.solar_satellite_percent, 100)
);
END IF;

v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - COALESCE(v_resources.last_update, v_now))) / 3600.0;

v_officer_bonuses := get_user_officer_bonuses(v_user_id);
v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);

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

SELECT COALESCE(ut.level, 0) INTO v_energy_tech_level
FROM user_technologies ut
JOIN technology_types tt ON tt.id = ut.technology_type_id
WHERE ut.user_id = v_user_id AND tt.code = 'energy_tech';
v_energy_tech_level := COALESCE(v_energy_tech_level, 0);

SELECT COALESCE(ps.quantity, 0) INTO v_solar_satellites
FROM planet_ships ps
JOIN ship_types st ON st.id = ps.ship_type_id
WHERE ps.planet_id = p_planet_id AND st.code = 'solar_satellite';
v_solar_satellites := COALESCE(v_solar_satellites, 0);

-- Energy consumption: apply % to each mine individually
-- Mine at 50% uses 50% energy AND produces 50% resources (OGame standard)
v_metal_energy_consumption := FLOOR(10 * v_metal_mine_level * POWER(1.1, v_metal_mine_level)) * v_metal_mine_pct;
v_crystal_energy_consumption := FLOOR(10 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level)) * v_crystal_mine_pct;
v_deuterium_energy_consumption := FLOOR(20 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level)) * v_deut_synth_pct;
v_total_energy_consumption := v_metal_energy_consumption + v_crystal_energy_consumption + v_deuterium_energy_consumption;

v_solar_position_factor := GREATEST(0.75, 1 + (8 - COALESCE(v_planet.position, 8)) * 0.025);

-- Energy production: apply % to each producer individually
v_solar_plant_energy := FLOOR(20 * v_solar_plant_level * POWER(1.1, v_solar_plant_level) * v_solar_position_factor) * v_solar_plant_pct;
v_fusion_reactor_energy := FLOOR(30 * v_fusion_reactor_level * POWER((1.05 + v_energy_tech_level * 0.01), v_fusion_reactor_level)) * v_fusion_reactor_pct;
v_solar_satellite_energy := FLOOR((v_planet.temp_max + 160) / 6.0) * v_solar_satellites * v_solar_satellite_pct;

v_solar_plant_energy := FLOOR(v_solar_plant_energy * (1 + v_energy_bonus));
v_fusion_reactor_energy := FLOOR(v_fusion_reactor_energy * (1 + v_energy_bonus));
v_solar_satellite_energy := FLOOR(v_solar_satellite_energy * (1 + v_energy_bonus));

v_total_energy_production := v_solar_plant_energy + v_fusion_reactor_energy + v_solar_satellite_energy;

IF v_total_energy_consumption > 0 THEN
v_energy_factor := LEAST(1, v_total_energy_production / v_total_energy_consumption);
ELSE
v_energy_factor := 1;
END IF;

-- Resource production: apply % to each mine individually
v_base_metal_production := FLOOR(30 * v_metal_mine_level * POWER(1.1, v_metal_mine_level)) * v_metal_mine_pct;
v_base_crystal_production := FLOOR(20 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level)) * v_crystal_mine_pct;
v_base_deuterium_production := FLOOR(10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) * (1.36 - 0.004 * v_planet.temp_max)) * v_deut_synth_pct;

v_base_metal_production := FLOOR(v_base_metal_production * (1 + v_mine_bonus));
v_base_crystal_production := FLOOR(v_base_crystal_production * (1 + v_mine_bonus));
v_base_deuterium_production := FLOOR(v_base_deuterium_production * (1 + v_mine_bonus));

-- Fusion consumption: also scaled by fusion reactor percentage
v_fusion_consumption := FLOOR(10 * v_fusion_reactor_level * POWER(1.1, v_fusion_reactor_level)) * v_fusion_reactor_pct;
v_base_deuterium_production := v_base_deuterium_production - v_fusion_consumption;

v_metal_production := FLOOR(v_base_metal_production * v_energy_factor);
v_crystal_production := FLOOR(v_base_crystal_production * v_energy_factor);
v_deuterium_production := FLOOR(v_base_deuterium_production * v_energy_factor);

v_metal_production := v_metal_production * v_resource_speed;
v_crystal_production := v_crystal_production * v_resource_speed;
v_deuterium_production := v_deuterium_production * v_resource_speed;

v_metal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_metal_storage_level) / 33.0)));
v_crystal_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_crystal_storage_level) / 33.0)));
v_deuterium_storage := FLOOR(5000 * FLOOR(2.5 * EXP((20.0 * v_deuterium_tank_level) / 33.0)));

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
'last_update', v_resources.last_update,
'metal_mine_percent', COALESCE(v_resources.metal_mine_percent, 100),
'crystal_mine_percent', COALESCE(v_resources.crystal_mine_percent, 100),
'deuterium_synth_percent', COALESCE(v_resources.deuterium_synth_percent, 100),
'solar_plant_percent', COALESCE(v_resources.solar_plant_percent, 100),
'fusion_reactor_percent', COALESCE(v_resources.fusion_reactor_percent, 100),
'solar_satellite_percent', COALESCE(v_resources.solar_satellite_percent, 100)
);
END IF;

IF v_resources.metal > v_metal_storage THEN
v_new_metal := v_resources.metal;
ELSE
v_new_metal := LEAST(v_metal_storage, GREATEST(0, v_resources.metal + v_metal_production * v_elapsed_hours));
END IF;

IF v_resources.crystal > v_crystal_storage THEN
v_new_crystal := v_resources.crystal;
ELSE
v_new_crystal := LEAST(v_crystal_storage, GREATEST(0, v_resources.crystal + v_crystal_production * v_elapsed_hours));
END IF;

IF v_resources.deuterium > v_deuterium_storage THEN
v_new_deuterium := v_resources.deuterium;
ELSE
v_new_deuterium := LEAST(v_deuterium_storage, GREATEST(0, v_resources.deuterium + v_deuterium_production * v_elapsed_hours));
END IF;

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
'calculated_at', v_now,
'metal_mine_percent', COALESCE(v_resources.metal_mine_percent, 100),
'crystal_mine_percent', COALESCE(v_resources.crystal_mine_percent, 100),
'deuterium_synth_percent', COALESCE(v_resources.deuterium_synth_percent, 100),
'solar_plant_percent', COALESCE(v_resources.solar_plant_percent, 100),
'fusion_reactor_percent', COALESCE(v_resources.fusion_reactor_percent, 100),
'solar_satellite_percent', COALESCE(v_resources.solar_satellite_percent, 100)
);
END;
$function$;
  `;

  await c.query(sql);
  console.log('✅ calculate_planet_resources updated with production percentages');

  // ============================================================
  // Create RPC function to update production percentages
  // ============================================================
  const rpc = `
CREATE OR REPLACE FUNCTION public.update_production_percentages(
  p_planet_id uuid,
  p_metal_mine_percent smallint DEFAULT NULL,
  p_crystal_mine_percent smallint DEFAULT NULL,
  p_deuterium_synth_percent smallint DEFAULT NULL,
  p_solar_plant_percent smallint DEFAULT NULL,
  p_fusion_reactor_percent smallint DEFAULT NULL,
  p_solar_satellite_percent smallint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $rpc$
DECLARE
  v_planet RECORD;
  v_result jsonb;
BEGIN
  -- Verify planet belongs to current user
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found or not yours');
  END IF;

  -- Validate all values are 0-100 (in steps of 10, OGame standard)
  IF p_metal_mine_percent IS NOT NULL AND (p_metal_mine_percent < 0 OR p_metal_mine_percent > 100 OR p_metal_mine_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'metal_mine_percent must be 0-100 in steps of 10');
  END IF;
  IF p_crystal_mine_percent IS NOT NULL AND (p_crystal_mine_percent < 0 OR p_crystal_mine_percent > 100 OR p_crystal_mine_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'crystal_mine_percent must be 0-100 in steps of 10');
  END IF;
  IF p_deuterium_synth_percent IS NOT NULL AND (p_deuterium_synth_percent < 0 OR p_deuterium_synth_percent > 100 OR p_deuterium_synth_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'deuterium_synth_percent must be 0-100 in steps of 10');
  END IF;
  IF p_solar_plant_percent IS NOT NULL AND (p_solar_plant_percent < 0 OR p_solar_plant_percent > 100 OR p_solar_plant_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'solar_plant_percent must be 0-100 in steps of 10');
  END IF;
  IF p_fusion_reactor_percent IS NOT NULL AND (p_fusion_reactor_percent < 0 OR p_fusion_reactor_percent > 100 OR p_fusion_reactor_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'fusion_reactor_percent must be 0-100 in steps of 10');
  END IF;
  IF p_solar_satellite_percent IS NOT NULL AND (p_solar_satellite_percent < 0 OR p_solar_satellite_percent > 100 OR p_solar_satellite_percent % 10 != 0) THEN
    RETURN jsonb_build_object('error', 'solar_satellite_percent must be 0-100 in steps of 10');
  END IF;

  -- First sync resources with current percentages (flush accumulated production)
  v_result := calculate_planet_resources(p_planet_id);

  -- Save accumulated resources before changing percentages
  UPDATE planet_resources SET
    metal = COALESCE((v_result->>'metal')::numeric, metal),
    crystal = COALESCE((v_result->>'crystal')::numeric, crystal),
    deuterium = COALESCE((v_result->>'deuterium')::numeric, deuterium),
    metal_per_hour = COALESCE((v_result->>'metal_per_hour')::numeric, metal_per_hour),
    crystal_per_hour = COALESCE((v_result->>'crystal_per_hour')::numeric, crystal_per_hour),
    deuterium_per_hour = COALESCE((v_result->>'deuterium_per_hour')::numeric, deuterium_per_hour),
    -- FIX: cast via numeric so values like "16382.000000000000000000" round
    --      into the integer column instead of failing int4in() parsing.
    energy_used = COALESCE((v_result->>'energy_used')::numeric, energy_used),
    energy_max = COALESCE((v_result->>'energy_max')::numeric, energy_max),
    metal_storage = COALESCE((v_result->>'metal_storage')::numeric, metal_storage),
    crystal_storage = COALESCE((v_result->>'crystal_storage')::numeric, crystal_storage),
    deuterium_storage = COALESCE((v_result->>'deuterium_storage')::numeric, deuterium_storage),
    last_update = now(),
    -- Update percentages (only if provided, keep existing otherwise)
    metal_mine_percent = COALESCE(p_metal_mine_percent, metal_mine_percent),
    crystal_mine_percent = COALESCE(p_crystal_mine_percent, crystal_mine_percent),
    deuterium_synth_percent = COALESCE(p_deuterium_synth_percent, deuterium_synth_percent),
    solar_plant_percent = COALESCE(p_solar_plant_percent, solar_plant_percent),
    fusion_reactor_percent = COALESCE(p_fusion_reactor_percent, fusion_reactor_percent),
    solar_satellite_percent = COALESCE(p_solar_satellite_percent, solar_satellite_percent)
  WHERE planet_id = p_planet_id;

  -- Recalculate with new percentages
  v_result := calculate_planet_resources(p_planet_id);

  RETURN v_result;
END;
$rpc$;

GRANT EXECUTE ON FUNCTION update_production_percentages(uuid, smallint, smallint, smallint, smallint, smallint, smallint) TO authenticated;
  `;

  await c.query(rpc);
  console.log('✅ update_production_percentages RPC created');

  // ============================================================
  // Verify: test with a known planet (should return same values as before since all are 100%)
  // ============================================================
  const testRes = await c.query(`
    SELECT pr.planet_id, 
      (calculate_planet_resources(pr.planet_id))->>'metal_per_hour' as metal_h,
      (calculate_planet_resources(pr.planet_id))->>'energy_used' as energy_used,
      (calculate_planet_resources(pr.planet_id))->>'energy_max' as energy_max,
      (calculate_planet_resources(pr.planet_id))->>'metal_mine_percent' as metal_pct
    FROM planet_resources pr 
    LIMIT 3
  `);
  console.log('\nSample verification (3 planets):');
  console.table(testRes.rows);

  await c.end();
  console.log('\n✅ All SQL updates complete');
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
