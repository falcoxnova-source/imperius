-- 1. Hangar repair system for Hero Ship
-- 2. Kits removed from expedition drops (bought from company store with FXU)
-- 3. Kit FXU prices configurable in game_settings
-- 4. Ship can't go on expeditions while repairing in hangar

ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS repair_until timestamptz;

INSERT INTO game_settings (key, value, description) VALUES
  ('hero_repair_kit_price_25', '500', 'Precio en FXU del Kit de Reparacion I (25%)'),
  ('hero_repair_kit_price_50', '1500', 'Precio en FXU del Kit de Reparacion II (50%)'),
  ('hero_repair_kit_price_75', '4000', 'Precio en FXU del Kit de Reparacion III (75%)'),
  ('hero_repair_kit_price_100', '10000', 'Precio en FXU del Kit de Reparacion IV (100%)')
ON CONFLICT (key) DO NOTHING;

-- ==========================================================================
-- Reparar nave en el hangar (consume metal + cristal, tiempo segun edificios)
-- ==========================================================================
CREATE OR REPLACE FUNCTION repair_hero_ship_in_hangar(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_active record;
  v_planet_id uuid;
  v_resources record;
  v_shipyard_level integer; v_robotics_level integer; v_nanite_level integer;
  v_edificios integer; v_puntos_totales integer;
  v_hp_faltante integer;
  v_hp_pct numeric;
  v_base numeric;
  v_costo_metal bigint; v_costo_cristal bigint;
  v_tiempo_base integer; v_multiplicador numeric; v_tiempo_final integer;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp >= v_ship.hp_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave ya esta al maximo de HP');
  END IF;

  SELECT * INTO v_active FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes reparar mientras la nave esta en expedicion');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave ya esta siendo reparada en el hangar');
  END IF;

  -- Find main planet and lock resources
  SELECT id INTO v_planet_id FROM planets WHERE user_id = p_user_id AND is_main_planet = true LIMIT 1;
  IF v_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes un planeta principal');
  END IF;

  SELECT metal, crystal INTO v_resources FROM planet_resources WHERE planet_id = v_planet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
  END IF;

  -- Building levels
  SELECT COALESCE(MAX(CASE WHEN bt.code = 'shipyard' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'robotics_factory' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'nanite_factory' THEN pb.level END), 0)
  INTO v_shipyard_level, v_robotics_level, v_nanite_level
  FROM planets p
  JOIN planet_buildings pb ON pb.planet_id = p.id
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE p.user_id = p_user_id AND p.is_main_planet = true;

  v_edificios := v_shipyard_level + v_robotics_level + v_nanite_level;
  v_hp_faltante := v_ship.hp_max - v_ship.hp;
  v_hp_pct := v_hp_faltante::numeric / GREATEST(v_ship.hp_max, 1);
  v_puntos_totales := COALESCE(v_ship.attack_points, 0) + COALESCE(v_ship.defense_points, 0) + COALESCE(v_ship.shield_points, 0) + COALESCE(v_ship.speed_points, 0);
  v_base := POWER(v_ship.level, 2) * 800 + v_puntos_totales * 50 + 2000;

  -- Resource cost (exponential like deuterium formula)
  v_costo_metal := CEIL(v_hp_pct * v_base);
  v_costo_cristal := CEIL(v_hp_pct * v_base * 0.5);

  -- Repair time (hours-scale, reduced by buildings)
  v_tiempo_base := CEIL(v_hp_faltante * 0.2);
  v_multiplicador := POWER(0.96, v_edificios);
  v_tiempo_final := GREATEST(1, CEIL(v_tiempo_base * v_multiplicador));

  -- Check resources
  IF v_resources.metal < v_costo_metal OR v_resources.crystal < v_costo_cristal THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Recursos insuficientes. Necesitas: ' || v_costo_metal || ' metal y ' || v_costo_cristal || ' cristal');
  END IF;

  -- Deduct resources
  UPDATE planet_resources SET
    metal = metal - v_costo_metal,
    crystal = crystal - v_costo_cristal
  WHERE planet_id = v_planet_id;

  -- Set repair timer (HP restored at end)
  UPDATE user_hero_ships SET
    repair_until = now() + (v_tiempo_final || ' minutes')::interval,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'metal_cost', v_costo_metal,
    'crystal_cost', v_costo_cristal,
    'repair_minutes', v_tiempo_final,
    'repair_until', (now() + (v_tiempo_final || ' minutes')::interval)::text
  );
END;
$$;

-- ==========================================================================
-- Comprar kit de reparacion con FXU (se agrega al inventario)
-- ==========================================================================
CREATE OR REPLACE FUNCTION buy_hero_repair_kit(p_user_id uuid, p_kit_pct integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_item record;
  v_profile record;
BEGIN
  SELECT value::numeric INTO v_price
  FROM game_settings
  WHERE key = 'hero_repair_kit_price_' || p_kit_pct;

  IF v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Kit no disponible');
  END IF;

  SELECT * INTO v_item FROM hero_ship_items
  WHERE is_repair_kit = true AND repair_amount = p_kit_pct
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item de kit no encontrado');
  END IF;

  SELECT fxu_balance INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  IF v_profile.fxu_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente. Necesitas: ' || v_price || ' FXU');
  END IF;

  PERFORM _internal_set_fxu_context();
  UPDATE profiles SET fxu_balance = fxu_balance - v_price WHERE id = p_user_id;
  PERFORM record_admin_revenue('hero_kit_sale', v_price, 'Hero repair kit ' || p_kit_pct || '%', NULL, NULL);

  INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
  VALUES (p_user_id, v_item.id, 1, 1)
  ON CONFLICT (user_id, item_id, item_level)
    DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;

  RETURN jsonb_build_object('success', true, 'message', 'Kit adquirido exitosamente');
END;
$$;

-- ==========================================================================
-- Update start_hero_expedition: also check repair_until
-- ==========================================================================
CREATE OR REPLACE FUNCTION start_hero_expedition(p_user_id uuid, p_expedition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_expedition record;
  v_active record;
  v_planet_id uuid;
  v_resources record;
  v_puntos_totales integer;
  v_costo_deuterio bigint;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave esta daniada. Reparala antes de salir');
  END IF;

  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'La nave esta siendo reparada en el hangar. Espera a que termine');
  END IF;

  SELECT * INTO v_expedition FROM hero_ship_expeditions WHERE id = p_expedition_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expedicion no encontrada');
  END IF;

  IF v_ship.level < v_expedition.min_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nivel minimo requerido: ' || v_expedition.min_level);
  END IF;

  SELECT * INTO v_active FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una expedicion en curso');
  END IF;

  v_puntos_totales := COALESCE(v_ship.attack_points, 0) + COALESCE(v_ship.defense_points, 0) + COALESCE(v_ship.shield_points, 0) + COALESCE(v_ship.speed_points, 0);
  v_costo_deuterio := CEIL(v_expedition.duration_minutes * (POWER(v_ship.level, 2) * 10 + v_puntos_totales * 3) + 100);

  SELECT id INTO v_planet_id FROM planets WHERE user_id = p_user_id AND is_main_planet = true LIMIT 1;
  IF v_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes un planeta principal');
  END IF;

  SELECT deuterium INTO v_resources FROM planet_resources WHERE planet_id = v_planet_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recursos del planeta no encontrados');
  END IF;

  IF v_resources.deuterium < v_costo_deuterio THEN
    RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente. Necesitas: ' || v_costo_deuterio || ', tienes: ' || FLOOR(v_resources.deuterium));
  END IF;

  UPDATE planet_resources SET deuterium = deuterium - v_costo_deuterio WHERE planet_id = v_planet_id;

  INSERT INTO hero_ship_active_expedition (user_id, expedition_id, started_at, returns_at)
  VALUES (p_user_id, p_expedition_id, now(), now() + (v_expedition.duration_minutes || ' minutes')::interval)
  ON CONFLICT (user_id) DO UPDATE SET
    expedition_id = EXCLUDED.expedition_id,
    started_at = EXCLUDED.started_at,
    returns_at = EXCLUDED.returns_at,
    claimed = false;

  RETURN jsonb_build_object(
    'success', true,
    'returns_at', (now() + (v_expedition.duration_minutes || ' minutes')::interval)::text,
    'duration_minutes', v_expedition.duration_minutes,
    'deuterium_cost', v_costo_deuterio
  );
END;
$$;

-- ==========================================================================
-- Update claim_hero_expedition: remove kit drops
-- ==========================================================================
CREATE OR REPLACE FUNCTION claim_hero_expedition(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active record;
  v_expedition record;
  v_reward_items jsonb := '[]'::jsonb;
  v_common_prob numeric;
  v_rare_prob numeric;
  v_epic_prob numeric;
  v_legendary_prob numeric;
  v_drop_chance numeric;
  v_roll numeric;
  v_found_item record;
  v_ship record;
  v_lvl integer;
  v_item_lvl integer;
  v_scale numeric;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  v_lvl := GREATEST(v_ship.level, 1);
  SELECT * INTO v_active FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes expedicion pendiente');
  END IF;

  IF now() < v_active.returns_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'La expedicion aun no regresa');
  END IF;

  SELECT * INTO v_expedition FROM hero_ship_expeditions WHERE id = v_active.expedition_id;

  v_common_prob := COALESCE(v_expedition.prob_common, 85);
  v_rare_prob := COALESCE(v_expedition.prob_rare, 12);
  v_epic_prob := COALESCE(v_expedition.prob_epic, 2.5);
  v_legendary_prob := COALESCE(v_expedition.prob_legendary, 0.5);
  v_drop_chance := COALESCE(v_expedition.drop_chance, 85);

  PERFORM add_hero_xp(p_user_id, v_expedition.xp_reward);

  UPDATE user_hero_ships SET hp = GREATEST(0, hp - v_expedition.hp_damage), updated_at = now() WHERE user_id = p_user_id;

  -- Only equipment drops (no kits)
  IF random() * 100 <= v_drop_chance AND
     v_common_prob + v_rare_prob + v_epic_prob + v_legendary_prob > 0 THEN
    v_roll := random() * (v_common_prob + v_rare_prob + v_epic_prob + v_legendary_prob);
    v_found_item := NULL;
    IF v_roll <= v_common_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'common' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    ELSIF v_roll <= v_common_prob + v_rare_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'rare' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    ELSIF v_roll <= v_common_prob + v_rare_prob + v_epic_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'epic' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    ELSE
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'legendary' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    END IF;
  ELSE
    v_found_item := NULL;
  END IF;

  IF v_found_item.id IS NOT NULL THEN
    IF v_lvl < v_found_item.min_level THEN
      v_item_lvl := v_found_item.min_level;
    ELSE
      v_item_lvl := FLOOR(random() * (v_lvl - v_found_item.min_level + 1))::integer + v_found_item.min_level;
    END IF;
    v_scale := v_item_lvl;

    INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
    VALUES (p_user_id, v_found_item.id, v_item_lvl, 1)
    ON CONFLICT (user_id, item_id, item_level) DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;

    v_reward_items := jsonb_build_array(jsonb_build_object(
      'name', v_found_item.name, 'rarity', v_found_item.rarity,
      'type', 'equipment',
      'slot_type', v_found_item.slot_type,
      'item_level', v_item_lvl,
      'attack_bonus', FLOOR(v_found_item.attack_bonus * v_scale),
      'defense_bonus', FLOOR(v_found_item.defense_bonus * v_scale),
      'shield_bonus', FLOOR(v_found_item.shield_bonus * v_scale),
      'speed_bonus', FLOOR(v_found_item.speed_bonus * v_scale),
      'loot_bonus', FLOOR(v_found_item.loot_bonus * v_scale)
    ));
  END IF;

  UPDATE hero_ship_active_expedition SET claimed = true WHERE id = v_active.id;

  RETURN jsonb_build_object(
    'success', true,
    'xp_gained', v_expedition.xp_reward,
    'hp_damage', v_expedition.hp_damage,
    'items_found', v_reward_items
  );
END;
$$;

-- ==========================================================================
-- Update get_hero_expeditions: remove prob_kit columns from output
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_hero_expeditions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'duration_minutes', duration_minutes,
    'xp_reward', xp_reward,
    'hp_damage', hp_damage,
    'hp_damage_min', hp_damage_min,
    'hp_damage_max', hp_damage_max,
    'min_level', min_level,
    'prob_common', prob_common,
    'prob_rare', prob_rare,
    'prob_epic', prob_epic,
    'prob_legendary', prob_legendary,
    'drop_chance', drop_chance
  ) ORDER BY duration_minutes), '[]'::jsonb) INTO v_result
  FROM hero_ship_expeditions;

  RETURN v_result;
END;
$$;

-- ==========================================================================
-- Update get_hero_ship: add repair info + hangar cost estimates
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_hero_ship(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_weapon record; v_shield record; v_module record; v_reactor record;
  v_weapon_lvl integer; v_shield_lvl integer; v_module_lvl integer; v_reactor_lvl integer;
  v_base_attack integer; v_base_defense integer; v_base_shield integer; v_base_speed integer; v_base_loot integer;
  v_total_points integer;
  v_respec_cost integer;
  v_shipyard_level integer; v_robotics_level integer; v_nanite_level integer;
  ws jsonb; ss jsonb; ms jsonb; rs jsonb;
  v_hp_faltante integer; v_hp_pct numeric; v_puntos_totales integer;
  v_base_cost numeric;
  v_hangar_metal bigint; v_hangar_cristal bigint;
  v_edificios integer; v_tiempo_base integer; v_multiplicador numeric; v_hangar_minutos integer;
  v_repair_remaining_seconds integer;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  PERFORM apply_hero_regen(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;

  v_total_points := (v_ship.level - 1) * 10;
  v_total_points := GREATEST(v_total_points, v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points);

  SELECT COALESCE(
    (SELECT value::integer FROM game_settings WHERE key = 'fxu_hero_respec_cost'),
    10000
  ) INTO v_respec_cost;

  SELECT * INTO v_weapon FROM hero_ship_items WHERE id = v_ship.weapon_slot;
  SELECT * INTO v_shield FROM hero_ship_items WHERE id = v_ship.shield_slot;
  SELECT * INTO v_module FROM hero_ship_items WHERE id = v_ship.module_slot;
  SELECT * INTO v_reactor FROM hero_ship_items WHERE id = v_ship.reactor_slot;

  v_weapon_lvl := v_ship.weapon_item_level;
  v_shield_lvl := v_ship.shield_item_level;
  v_module_lvl := v_ship.module_item_level;
  v_reactor_lvl := v_ship.reactor_item_level;

  v_base_attack := v_ship.attack_points;
  v_base_attack := v_base_attack + COALESCE(FLOOR(v_weapon.attack_bonus * v_weapon_lvl), 0);
  v_base_attack := v_base_attack + COALESCE(FLOOR(v_shield.attack_bonus * v_shield_lvl), 0);
  v_base_attack := v_base_attack + COALESCE(FLOOR(v_module.attack_bonus * v_module_lvl), 0);
  v_base_attack := v_base_attack + COALESCE(FLOOR(v_reactor.attack_bonus * v_reactor_lvl), 0);

  v_base_defense := v_ship.defense_points;
  v_base_defense := v_base_defense + COALESCE(FLOOR(v_weapon.defense_bonus * v_weapon_lvl), 0);
  v_base_defense := v_base_defense + COALESCE(FLOOR(v_shield.defense_bonus * v_shield_lvl), 0);
  v_base_defense := v_base_defense + COALESCE(FLOOR(v_module.defense_bonus * v_module_lvl), 0);
  v_base_defense := v_base_defense + COALESCE(FLOOR(v_reactor.defense_bonus * v_reactor_lvl), 0);

  v_base_shield := v_ship.shield_points;
  v_base_shield := v_base_shield + COALESCE(FLOOR(v_weapon.shield_bonus * v_weapon_lvl), 0);
  v_base_shield := v_base_shield + COALESCE(FLOOR(v_shield.shield_bonus * v_shield_lvl), 0);
  v_base_shield := v_base_shield + COALESCE(FLOOR(v_module.shield_bonus * v_module_lvl), 0);
  v_base_shield := v_base_shield + COALESCE(FLOOR(v_reactor.shield_bonus * v_reactor_lvl), 0);

  v_base_speed := v_ship.speed_points;
  v_base_speed := v_base_speed + COALESCE(FLOOR(v_weapon.speed_bonus * v_weapon_lvl), 0);
  v_base_speed := v_base_speed + COALESCE(FLOOR(v_shield.speed_bonus * v_shield_lvl), 0);
  v_base_speed := v_base_speed + COALESCE(FLOOR(v_module.speed_bonus * v_module_lvl), 0);
  v_base_speed := v_base_speed + COALESCE(FLOOR(v_reactor.speed_bonus * v_reactor_lvl), 0);

  v_base_loot := 0;
  v_base_loot := v_base_loot + COALESCE(FLOOR(v_weapon.loot_bonus * v_weapon_lvl), 0);
  v_base_loot := v_base_loot + COALESCE(FLOOR(v_shield.loot_bonus * v_shield_lvl), 0);
  v_base_loot := v_base_loot + COALESCE(FLOOR(v_module.loot_bonus * v_module_lvl), 0);
  v_base_loot := v_base_loot + COALESCE(FLOOR(v_reactor.loot_bonus * v_reactor_lvl), 0);

  SELECT COALESCE(MAX(CASE WHEN bt.code = 'shipyard' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'robotics_factory' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'nanite_factory' THEN pb.level END), 0)
  INTO v_shipyard_level, v_robotics_level, v_nanite_level
  FROM planets p
  JOIN planet_buildings pb ON pb.planet_id = p.id
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE p.user_id = p_user_id AND p.is_main_planet = true;

  -- Hangar repair cost estimate (exponential like deuterium)
  v_hp_faltante := v_ship.hp_max - v_ship.hp;
  v_hp_pct := v_hp_faltante::numeric / GREATEST(v_ship.hp_max, 1);
  v_puntos_totales := COALESCE(v_ship.attack_points, 0) + COALESCE(v_ship.defense_points, 0) + COALESCE(v_ship.shield_points, 0) + COALESCE(v_ship.speed_points, 0);
  v_base_cost := POWER(v_ship.level, 2) * 800 + v_puntos_totales * 50 + 2000;
  v_hangar_metal := CEIL(v_hp_pct * v_base_cost);
  v_hangar_cristal := CEIL(v_hp_pct * v_base_cost * 0.5);

  v_edificios := v_shipyard_level + v_robotics_level + v_nanite_level;
  v_tiempo_base := CEIL(v_hp_faltante * 0.2);
  v_multiplicador := POWER(0.96, v_edificios);
  v_hangar_minutos := GREATEST(1, CEIL(v_tiempo_base * v_multiplicador));

  -- Remaining repair time
  IF v_ship.repair_until IS NOT NULL AND now() < v_ship.repair_until THEN
    v_repair_remaining_seconds := EXTRACT(EPOCH FROM (v_ship.repair_until - now()));
  ELSE
    v_repair_remaining_seconds := 0;
  END IF;

  IF v_weapon.id IS NOT NULL THEN
    ws := jsonb_build_object('id', v_weapon.id, 'name', v_weapon.name, 'rarity', v_weapon.rarity,
      'item_level', v_weapon_lvl,
      'attack_bonus', FLOOR(v_weapon.attack_bonus * v_weapon_lvl),
      'defense_bonus', FLOOR(v_weapon.defense_bonus * v_weapon_lvl),
      'shield_bonus', FLOOR(v_weapon.shield_bonus * v_weapon_lvl),
      'speed_bonus', FLOOR(v_weapon.speed_bonus * v_weapon_lvl),
      'loot_bonus', FLOOR(v_weapon.loot_bonus * v_weapon_lvl));
  ELSE ws := null; END IF;
  IF v_shield.id IS NOT NULL THEN
    ss := jsonb_build_object('id', v_shield.id, 'name', v_shield.name, 'rarity', v_shield.rarity,
      'item_level', v_shield_lvl,
      'attack_bonus', FLOOR(v_shield.attack_bonus * v_shield_lvl),
      'defense_bonus', FLOOR(v_shield.defense_bonus * v_shield_lvl),
      'shield_bonus', FLOOR(v_shield.shield_bonus * v_shield_lvl),
      'speed_bonus', FLOOR(v_shield.speed_bonus * v_shield_lvl),
      'loot_bonus', FLOOR(v_shield.loot_bonus * v_shield_lvl));
  ELSE ss := null; END IF;
  IF v_module.id IS NOT NULL THEN
    ms := jsonb_build_object('id', v_module.id, 'name', v_module.name, 'rarity', v_module.rarity,
      'item_level', v_module_lvl,
      'attack_bonus', FLOOR(v_module.attack_bonus * v_module_lvl),
      'defense_bonus', FLOOR(v_module.defense_bonus * v_module_lvl),
      'shield_bonus', FLOOR(v_module.shield_bonus * v_module_lvl),
      'speed_bonus', FLOOR(v_module.speed_bonus * v_module_lvl),
      'loot_bonus', FLOOR(v_module.loot_bonus * v_module_lvl));
  ELSE ss := null; END IF;
  IF v_reactor.id IS NOT NULL THEN
    rs := jsonb_build_object('id', v_reactor.id, 'name', v_reactor.name, 'rarity', v_reactor.rarity,
      'item_level', v_reactor_lvl,
      'attack_bonus', FLOOR(v_reactor.attack_bonus * v_reactor_lvl),
      'defense_bonus', FLOOR(v_reactor.defense_bonus * v_reactor_lvl),
      'shield_bonus', FLOOR(v_reactor.shield_bonus * v_reactor_lvl),
      'speed_bonus', FLOOR(v_reactor.speed_bonus * v_reactor_lvl),
      'loot_bonus', FLOOR(v_reactor.loot_bonus * v_reactor_lvl));
  ELSE rs := null; END IF;

  RETURN jsonb_build_object(
    'id', v_ship.id,
    'level', v_ship.level,
    'xp', v_ship.xp,
    'xp_to_next', v_ship.xp_to_next,
    'hp', v_ship.hp,
    'hp_max', v_ship.hp_max,
    'attack_points', v_ship.attack_points,
    'defense_points', v_ship.defense_points,
    'shield_points', v_ship.shield_points,
    'speed_points', v_ship.speed_points,
    'total_points', v_total_points,
    'free_points', v_total_points - (v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points),
    'respec_cost', v_respec_cost,
    'total_attack', v_base_attack,
    'total_defense', v_base_defense,
    'total_shield', v_base_shield,
    'total_speed', v_base_speed,
    'weapon_slot', ws,
    'shield_slot', ss,
    'module_slot', ms,
    'reactor_slot', rs,
    'hangar_metal_cost', v_hangar_metal,
    'hangar_crystal_cost', v_hangar_cristal,
    'hangar_repair_minutes', v_hangar_minutos,
    'repair_until', v_ship.repair_until,
    'repair_remaining_seconds', v_repair_remaining_seconds
  );
END;
$$;

-- ==========================================================================
-- apply_hero_regen: only handles hangar repair completion (NO passive regen)
-- ==========================================================================
CREATE OR REPLACE FUNCTION apply_hero_regen(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
BEGIN
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- If repair finished, restore all HP
  IF v_ship.repair_until IS NOT NULL AND now() >= v_ship.repair_until THEN
    UPDATE user_hero_ships SET hp = hp_max, repair_until = NULL, updated_at = now() WHERE id = v_ship.id;
  END IF;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION repair_hero_ship_in_hangar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION buy_hero_repair_kit(uuid, integer) TO authenticated;
