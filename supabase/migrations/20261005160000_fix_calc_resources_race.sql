-- [RACE1] calculate_planet_resources: SELECT ... FOR UPDATE para evitar lost update
-- (llegaban las naves de un despliegue pero no los recursos).
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
  v_metal_prod_tech int := 0;
  v_crystal_prod_tech int := 0;
  v_deut_prod_tech int := 0;

  -- Porcentajes de producción (0..1)
  v_pct_metal numeric := 1.0;
  v_pct_crystal numeric := 1.0;
  v_pct_deut numeric := 1.0;
  v_pct_solar numeric := 1.0;
  v_pct_fusion numeric := 1.0;
  v_pct_satellite numeric := 1.0;

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
  v_active_prod_bonus numeric := 0;

  v_is_main boolean;
  v_depletion_enabled boolean := true;
  v_metal_available numeric;
  v_crystal_available numeric;
  v_deuterium_available numeric;
  v_metal_would_produce numeric;
  v_crystal_would_produce numeric;
  v_deuterium_would_produce numeric;
  v_all_depleted boolean := false;

  -- >>> VIP Plus production bonus <<<
  v_vip_prod_bonus numeric := 0;      -- fraction, e.g. 0.50
  v_vip_period_start timestamptz;
  v_vip_active_seconds numeric := 0;
  v_vip_accum_mult numeric := 1.0;    -- applied to what is actually credited
  v_vip_now_mult numeric := 1.0;      -- applied to the displayed hourly rate
  v_metal_rate_display numeric;
  v_crystal_rate_display numeric;
  v_deuterium_rate_display numeric;
  v_colmkt5_since timestamptz; -- [COLMKT5]
BEGIN
  v_resource_speed := COALESCE(get_resource_speed(), 10);

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Planet not found'); END IF;

  v_user_id := v_planet.user_id;
  v_is_main := v_planet.is_main_planet;

  -- [RACE1] bloquear la fila: el UPDATE final escribe valores absolutos y sin
  -- lock pisaba la carga sumada en paralelo por process_fleet_arrival.
  SELECT * INTO v_resources FROM planet_resources WHERE planet_id = p_planet_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Resources not found'); END IF;

  -- Porcentajes configurados (0..1), robusto ante NULL / fuera de rango
  v_pct_metal     := LEAST(100, GREATEST(0, COALESCE(v_resources.metal_mine_percent, 100))) / 100.0;
  v_pct_crystal   := LEAST(100, GREATEST(0, COALESCE(v_resources.crystal_mine_percent, 100))) / 100.0;
  v_pct_deut      := LEAST(100, GREATEST(0, COALESCE(v_resources.deuterium_synth_percent, 100))) / 100.0;
  v_pct_solar     := LEAST(100, GREATEST(0, COALESCE(v_resources.solar_plant_percent, 100))) / 100.0;
  v_pct_fusion    := LEAST(100, GREATEST(0, COALESCE(v_resources.fusion_reactor_percent, 100))) / 100.0;
  v_pct_satellite := LEAST(100, GREATEST(0, COALESCE(v_resources.solar_satellite_percent, 100))) / 100.0;

  IF v_resources.last_update IS NOT NULL THEN
    v_elapsed_hours := EXTRACT(EPOCH FROM (v_now - v_resources.last_update)) / 3600.0;
  ELSE v_elapsed_hours := 0; END IF;
  IF v_elapsed_hours > 48 THEN v_elapsed_hours := 48; END IF;
  IF v_elapsed_hours < 0 THEN v_elapsed_hours := 0; END IF;
  -- [COLMKT5] colonia en venta: solo cuenta la produccion anterior a la publicacion
  v_colmkt5_since := public._colony_listed_since(p_planet_id);
  IF v_colmkt5_since IS NOT NULL THEN
    v_elapsed_hours := LEAST(v_elapsed_hours, GREATEST(0, EXTRACT(EPOCH FROM (v_colmkt5_since - v_resources.last_update)) / 3600.0));
  END IF;

  IF v_user_id IS NOT NULL THEN
    v_officer_bonuses := get_user_officer_bonuses(v_user_id);
    v_mine_bonus := COALESCE((v_officer_bonuses->>'mineProduction')::numeric, 0);
    v_energy_bonus := COALESCE((v_officer_bonuses->>'energyProduction')::numeric, 0);
    IF EXISTS (SELECT 1 FROM user_daily_streaks WHERE user_id = v_user_id AND expires_at > v_now) THEN
      v_mine_bonus := v_mine_bonus + 0.05;
    END IF;
    SELECT COALESCE(SUM(bonus_value), 0) * 0.01 INTO v_active_prod_bonus
    FROM user_active_bonuses
    WHERE user_id = v_user_id AND bonus_type = 'production_bonus' AND expires_at > v_now;
    v_mine_bonus := v_mine_bonus + COALESCE(v_active_prod_bonus, 0);
  END IF;

  -- ===================== VIP Plus: production bonus =========================
  -- Kept completely separate from v_mine_bonus so officers, daily streak and
  -- daily-mission bonuses keep their exact current weight. The bonus is
  -- pro-rated over the portion of [last_update, now] covered by an active
  -- subscription, so it is never granted retroactively nor lost on expiry.
  IF v_user_id IS NOT NULL THEN
    v_vip_prod_bonus := COALESCE(get_vip_production_bonus(), 0);
  END IF;

  IF v_user_id IS NOT NULL AND v_vip_prod_bonus > 0 THEN
    IF is_user_plus(v_user_id) THEN
      v_vip_now_mult := 1.0 + v_vip_prod_bonus;
    END IF;

    IF v_elapsed_hours > 0 THEN
      v_vip_period_start := v_now - make_interval(secs => (v_elapsed_hours * 3600.0)::double precision);

      SELECT COALESCE(SUM(
               EXTRACT(EPOCH FROM (
                 LEAST(v_now, ps.expires_at)
                 - GREATEST(v_vip_period_start, COALESCE(ps.started_at, ps.created_at, v_vip_period_start))
               ))
             ), 0)
        INTO v_vip_active_seconds
      FROM plus_subscriptions ps
      WHERE ps.user_id = v_user_id
        AND ps.is_active = true
        AND ps.expires_at IS NOT NULL
        AND ps.expires_at > v_vip_period_start
        AND COALESCE(ps.started_at, ps.created_at, v_vip_period_start) < v_now;

      -- overlapping subscriptions must never grant more than the real window
      v_vip_active_seconds := LEAST(GREATEST(COALESCE(v_vip_active_seconds, 0), 0),
                                    v_elapsed_hours * 3600.0);

      v_vip_accum_mult := 1.0 + v_vip_prod_bonus
                          * (v_vip_active_seconds / (v_elapsed_hours * 3600.0));
    ELSE
      v_vip_accum_mult := v_vip_now_mult;
    END IF;
  END IF;
  -- =========================================================================

  SELECT COALESCE(MAX(pb.level), 0) INTO v_metal_mine_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_mine';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_crystal_mine_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_mine';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_deuterium_synth_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_synthesizer';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_solar_plant_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'solar_plant';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_fusion_reactor_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'fusion_reactor';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_metal_storage_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'metal_storage';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_crystal_storage_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'crystal_storage';
  SELECT COALESCE(MAX(pb.level), 0) INTO v_deuterium_tank_level FROM planet_buildings pb JOIN building_types bt ON bt.id = pb.building_type_id WHERE pb.planet_id = p_planet_id AND bt.code = 'deuterium_tank';

  SELECT COALESCE(SUM(ps.quantity), 0) INTO v_solar_satellites FROM planet_ships ps JOIN ship_types st ON st.id = ps.ship_type_id WHERE ps.planet_id = p_planet_id AND st.code = 'solar_satellite';

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(MAX(ut.level), 0) INTO v_energy_tech_level FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id WHERE ut.user_id = v_user_id AND tt.code = 'energy_tech';
    SELECT COALESCE(MAX(ut.level), 0) INTO v_metal_prod_tech FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id WHERE ut.user_id = v_user_id AND tt.code = 'metal_production';
    SELECT COALESCE(MAX(ut.level), 0) INTO v_crystal_prod_tech FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id WHERE ut.user_id = v_user_id AND tt.code = 'crystal_production';
    SELECT COALESCE(MAX(ut.level), 0) INTO v_deut_prod_tech FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id WHERE ut.user_id = v_user_id AND tt.code = 'deuterium_production';
  END IF;

  -- Producción base ESCALADA por el porcentaje de cada mina
  v_base_metal_production := 30 * v_metal_mine_level * POWER(1.1, v_metal_mine_level) * v_pct_metal;
  v_base_crystal_production := 20 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level) * v_pct_crystal;
  v_base_deuterium_production := 10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) * (1.36 - 0.004 * COALESCE(v_planet.temp_max, 40)) * v_pct_deut;

  -- Consumo de energía ESCALADO por el porcentaje de cada mina
  v_metal_energy_consumption := 10 * v_metal_mine_level * POWER(1.1, v_metal_mine_level) * v_pct_metal;
  v_crystal_energy_consumption := 10 * v_crystal_mine_level * POWER(1.1, v_crystal_mine_level) * v_pct_crystal;
  v_deuterium_energy_consumption := 10 * v_deuterium_synth_level * POWER(1.1, v_deuterium_synth_level) * v_pct_deut;
  v_total_energy_consumption := v_metal_energy_consumption + v_crystal_energy_consumption + v_deuterium_energy_consumption;

  -- Producción de energía ESCALADA por el porcentaje de cada fuente
  v_solar_plant_energy := 20 * v_solar_plant_level * POWER(1.1, v_solar_plant_level) * v_pct_solar;
  v_fusion_reactor_energy := 30 * v_fusion_reactor_level * POWER(1.1, v_fusion_reactor_level) * v_pct_fusion;
  v_solar_satellite_energy := 20 * v_solar_satellites * (1 + v_energy_tech_level * 0.05) * v_pct_satellite;
  v_total_energy_production := v_solar_plant_energy + v_fusion_reactor_energy + v_solar_satellite_energy;
  IF v_energy_bonus > 0 THEN v_total_energy_production := v_total_energy_production * (1 + v_energy_bonus); END IF;

  IF v_total_energy_consumption > 0 THEN v_energy_factor := LEAST(1.0, v_total_energy_production / v_total_energy_consumption); ELSE v_energy_factor := 1.0; END IF;

  v_metal_production := v_base_metal_production * v_energy_factor;
  v_crystal_production := v_base_crystal_production * v_energy_factor;
  v_deuterium_production := v_base_deuterium_production * v_energy_factor;

  v_metal_production := v_metal_production * (1 + v_metal_prod_tech * 0.02);
  v_crystal_production := v_crystal_production * (1 + v_crystal_prod_tech * 0.02);
  v_deuterium_production := v_deuterium_production * (1 + v_deut_prod_tech * 0.02);

  IF v_mine_bonus > 0 THEN
    v_metal_production := v_metal_production * (1 + v_mine_bonus);
    v_crystal_production := v_crystal_production * (1 + v_mine_bonus);
    v_deuterium_production := v_deuterium_production * (1 + v_mine_bonus);
  END IF;

  v_metal_production := v_metal_production * v_resource_speed;
  v_crystal_production := v_crystal_production * v_resource_speed;
  v_deuterium_production := v_deuterium_production * v_resource_speed;

  -- >>> VIP Plus: applied last, multiplicatively, on the credited amount <<<
  IF v_vip_accum_mult <> 1.0 THEN
    v_metal_production := v_metal_production * v_vip_accum_mult;
    v_crystal_production := v_crystal_production * v_vip_accum_mult;
    v_deuterium_production := v_deuterium_production * v_vip_accum_mult;
  END IF;

  BEGIN
    v_depletion_enabled := COALESCE((SELECT value::boolean FROM game_settings WHERE key = 'depletion_enabled'), true);
  EXCEPTION WHEN OTHERS THEN v_depletion_enabled := true; END;

  IF NOT v_is_main AND v_depletion_enabled THEN
    v_metal_available := COALESCE(v_planet.metal_deposit, 0);
    v_crystal_available := COALESCE(v_planet.crystal_deposit, 0);
    v_deuterium_available := COALESCE(v_planet.deuterium_deposit, 0);
    v_metal_would_produce := v_metal_production * v_elapsed_hours;
    v_crystal_would_produce := v_crystal_production * v_elapsed_hours;
    v_deuterium_would_produce := v_deuterium_production * v_elapsed_hours;

    IF v_metal_available <= 0 THEN v_metal_production := 0; v_metal_would_produce := 0;
    ELSIF v_metal_would_produce > v_metal_available THEN v_metal_would_produce := v_metal_available; v_metal_production := v_metal_available / GREATEST(v_elapsed_hours, 0.0001); END IF;
    IF v_crystal_available <= 0 THEN v_crystal_production := 0; v_crystal_would_produce := 0;
    ELSIF v_crystal_would_produce > v_crystal_available THEN v_crystal_would_produce := v_crystal_available; v_crystal_production := v_crystal_available / GREATEST(v_elapsed_hours, 0.0001); END IF;
    IF v_deuterium_available <= 0 THEN v_deuterium_production := 0; v_deuterium_would_produce := 0;
    ELSIF v_deuterium_would_produce > v_deuterium_available THEN v_deuterium_would_produce := v_deuterium_available; v_deuterium_production := v_deuterium_available / GREATEST(v_elapsed_hours, 0.0001); END IF;

    v_metal_available := v_metal_available - v_metal_would_produce;
    v_crystal_available := v_crystal_available - v_crystal_would_produce;
    v_deuterium_available := v_deuterium_available - v_deuterium_would_produce;
    IF v_metal_available < 0 THEN v_metal_available := 0; END IF;
    IF v_crystal_available < 0 THEN v_crystal_available := 0; END IF;
    IF v_deuterium_available < 0 THEN v_deuterium_available := 0; END IF;

    UPDATE planets SET metal_deposit = CASE WHEN metal_deposit IS NULL THEN NULL ELSE v_metal_available::bigint END, crystal_deposit = CASE WHEN crystal_deposit IS NULL THEN NULL ELSE v_crystal_available::bigint END, deuterium_deposit = CASE WHEN deuterium_deposit IS NULL THEN NULL ELSE v_deuterium_available::bigint END WHERE id = p_planet_id;

    IF v_metal_available <= 0 AND v_crystal_available <= 0 AND v_deuterium_available <= 0 THEN
      IF v_planet.planet_status != 'depleted' THEN UPDATE planets SET planet_status = 'depleted', depleted_at = now() WHERE id = p_planet_id; END IF;
    END IF;
  END IF;

  v_new_metal := v_resources.metal + (v_metal_production * v_elapsed_hours);
  v_new_crystal := v_resources.crystal + (v_crystal_production * v_elapsed_hours);
  v_new_deuterium := v_resources.deuterium + (v_deuterium_production * v_elapsed_hours);

  -- Hourly rate shown to the player: the CURRENT rate (VIP counted only if it
  -- is active right now), not the pro-rated one used for the credited amount.
  v_metal_rate_display := v_metal_production / GREATEST(v_vip_accum_mult, 0.0001) * v_vip_now_mult;
  v_crystal_rate_display := v_crystal_production / GREATEST(v_vip_accum_mult, 0.0001) * v_vip_now_mult;
  v_deuterium_rate_display := v_deuterium_production / GREATEST(v_vip_accum_mult, 0.0001) * v_vip_now_mult;

  v_metal_storage := 10000 * POWER(2, v_metal_storage_level);
  v_crystal_storage := 10000 * POWER(2, v_crystal_storage_level);
  v_deuterium_storage := 10000 * POWER(2, v_deuterium_tank_level);
  IF v_new_metal > v_metal_storage THEN
    v_new_metal := GREATEST(v_metal_storage, v_resources.metal);
  END IF;
  IF v_new_crystal > v_crystal_storage THEN
    v_new_crystal := GREATEST(v_crystal_storage, v_resources.crystal);
  END IF;
  IF v_new_deuterium > v_deuterium_storage THEN
    v_new_deuterium := GREATEST(v_deuterium_storage, v_resources.deuterium);
  END IF;

  -- [COLMKT5] colonia en venta: produccion pausada
  IF v_colmkt5_since IS NOT NULL THEN
    v_metal_rate_display := 0; v_crystal_rate_display := 0; v_deuterium_rate_display := 0;
  END IF;
  UPDATE planet_resources SET metal = v_new_metal, crystal = v_new_crystal, deuterium = v_new_deuterium, metal_per_hour = v_metal_rate_display, crystal_per_hour = v_crystal_rate_display, deuterium_per_hour = v_deuterium_rate_display, metal_storage = v_metal_storage, crystal_storage = v_crystal_storage, deuterium_storage = v_deuterium_storage, energy_used = v_total_energy_consumption, energy_max = v_total_energy_production, last_update = v_now WHERE planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'metal', v_new_metal, 'crystal', v_new_crystal, 'deuterium', v_new_deuterium,
    'metal_per_hour', v_metal_rate_display, 'crystal_per_hour', v_crystal_rate_display, 'deuterium_per_hour', v_deuterium_rate_display,
    'metal_storage', v_metal_storage, 'crystal_storage', v_crystal_storage, 'deuterium_storage', v_deuterium_storage,
    'energy_used', v_total_energy_consumption, 'energy_max', v_total_energy_production, 'last_update', v_now,
    'metal_mine_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.metal_mine_percent, 100))),
    'crystal_mine_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.crystal_mine_percent, 100))),
    'deuterium_synth_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.deuterium_synth_percent, 100))),
    'solar_plant_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.solar_plant_percent, 100))),
    'fusion_reactor_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.fusion_reactor_percent, 100))),
    'solar_satellite_percent', LEAST(100, GREATEST(0, COALESCE(v_resources.solar_satellite_percent, 100)))
  );
END;
$function$;

