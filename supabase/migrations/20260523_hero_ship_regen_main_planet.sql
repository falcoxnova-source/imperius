-- Regeneracion pasiva usa solo edificios del planeta principal
CREATE OR REPLACE FUNCTION apply_hero_regen(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_elapsed_hours numeric;
  v_hp_per_hour numeric;
  v_shipyard_level integer;
  v_robotics_level integer;
  v_nanite_level integer;
  v_denom numeric;
  v_repair_hours numeric;
  v_active_expedition uuid;
  v_hp_gain integer;
BEGIN
  SELECT id INTO v_active_expedition FROM hero_ship_active_expedition
  WHERE user_id = p_user_id AND claimed = false LIMIT 1;

  SELECT COALESCE(MAX(CASE WHEN bt.code = 'shipyard' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'robotics_factory' THEN pb.level END), 0),
         COALESCE(MAX(CASE WHEN bt.code = 'nanite_factory' THEN pb.level END), 0)
  INTO v_shipyard_level, v_robotics_level, v_nanite_level
  FROM planets p
  JOIN planet_buildings pb ON pb.planet_id = p.id
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE p.user_id = p_user_id AND p.is_main_planet = true;

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_active_expedition IS NOT NULL THEN
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  IF v_ship.hp >= v_ship.hp_max THEN
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
    RETURN;
  END IF;

  v_elapsed_hours := EXTRACT(EPOCH FROM (now() - v_ship.last_regen_at)) / 3600;
  IF v_elapsed_hours <= 0 THEN RETURN; END IF;

  v_denom := 1 + v_shipyard_level * 0.08 + v_robotics_level * 0.1 + v_nanite_level * 0.12;
  v_repair_hours := GREATEST(24, LEAST(240, 240 / v_denom));
  v_hp_per_hour := v_ship.hp_max / v_repair_hours;
  v_hp_gain := LEAST(FLOOR(v_elapsed_hours * v_hp_per_hour), v_ship.hp_max - v_ship.hp);

  IF v_hp_gain > 0 THEN
    UPDATE user_hero_ships SET hp = hp + v_hp_gain, last_regen_at = now(), updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    UPDATE user_hero_ships SET last_regen_at = now() WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- get_hero_ship: misma correccion en el calculo de regeneracion
CREATE OR REPLACE FUNCTION get_hero_ship(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_total_points integer;
  v_respec_cost integer;
  v_weapon record;
  v_shield record;
  v_module record;
  v_reactor record;
  v_weapon_lvl integer;
  v_shield_lvl integer;
  v_module_lvl integer;
  v_reactor_lvl integer;
  v_base_attack integer;
  v_base_defense integer;
  v_base_shield integer;
  v_base_speed integer;
  v_base_loot integer;
  v_shipyard_level integer; v_robotics_level integer; v_nanite_level integer;
  v_denom numeric; v_repair_hours numeric; v_hp_per_hour numeric;
  ws jsonb; ss jsonb; ms jsonb; rs jsonb;
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
  v_denom := 1 + v_shipyard_level * 0.08 + v_robotics_level * 0.1 + v_nanite_level * 0.12;
  v_repair_hours := GREATEST(24, LEAST(240, 240 / v_denom));
  v_hp_per_hour := v_ship.hp_max / v_repair_hours;

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
    'repair_hours', v_repair_hours,
    'hp_regen_per_hour', v_hp_per_hour,
    'last_regen_at', v_ship.last_regen_at,
    'weapon_slot', ws,
    'shield_slot', ss,
    'module_slot', ms,
    'reactor_slot', rs
  );
END;
$$;
