-- Fix: remove passive HP regen from get_hero_ship (lines 497-501)
-- The condition `repair_until IS NULL` was restoring HP to max on every page load.
-- HP should only be restored when repair_until expires (handled by apply_hero_regen).

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

  -- Hangar repair cost estimate
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
