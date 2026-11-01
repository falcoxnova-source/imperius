CREATE OR REPLACE FUNCTION public.update_production_percentages(p_planet_id uuid, p_metal_mine_percent smallint DEFAULT NULL::smallint, p_crystal_mine_percent smallint DEFAULT NULL::smallint, p_deuterium_synth_percent smallint DEFAULT NULL::smallint, p_solar_plant_percent smallint DEFAULT NULL::smallint, p_fusion_reactor_percent smallint DEFAULT NULL::smallint, p_solar_satellite_percent smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    metal              = COALESCE((v_result->>'metal')::numeric, metal),
    crystal            = COALESCE((v_result->>'crystal')::numeric, crystal),
    deuterium          = COALESCE((v_result->>'deuterium')::numeric, deuterium),
    metal_per_hour     = COALESCE((v_result->>'metal_per_hour')::numeric, metal_per_hour),
    crystal_per_hour   = COALESCE((v_result->>'crystal_per_hour')::numeric, crystal_per_hour),
    deuterium_per_hour = COALESCE((v_result->>'deuterium_per_hour')::numeric, deuterium_per_hour),
    -- FIX: cast via numeric so values like "16382.000000000000000000" round
    --      into the integer column instead of failing int4in() parsing.
    energy_used        = COALESCE((v_result->>'energy_used')::numeric, energy_used),
    energy_max         = COALESCE((v_result->>'energy_max')::numeric,  energy_max),
    metal_storage      = COALESCE((v_result->>'metal_storage')::numeric, metal_storage),
    crystal_storage    = COALESCE((v_result->>'crystal_storage')::numeric, crystal_storage),
    deuterium_storage  = COALESCE((v_result->>'deuterium_storage')::numeric, deuterium_storage),
    last_update = now(),
    -- Update percentages (only if provided, keep existing otherwise)
    metal_mine_percent      = COALESCE(p_metal_mine_percent, metal_mine_percent),
    crystal_mine_percent    = COALESCE(p_crystal_mine_percent, crystal_mine_percent),
    deuterium_synth_percent = COALESCE(p_deuterium_synth_percent, deuterium_synth_percent),
    solar_plant_percent     = COALESCE(p_solar_plant_percent, solar_plant_percent),
    fusion_reactor_percent  = COALESCE(p_fusion_reactor_percent, fusion_reactor_percent),
    solar_satellite_percent = COALESCE(p_solar_satellite_percent, solar_satellite_percent)
  WHERE planet_id = p_planet_id;

  -- Recalculate with new percentages
  v_result := calculate_planet_resources(p_planet_id);

  RETURN v_result;
END;
$function$

