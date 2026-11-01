-- Nivel propio de items en inventario
ALTER TABLE user_hero_ship_inventory ADD COLUMN IF NOT EXISTS item_level integer NOT NULL DEFAULT 1;
ALTER TABLE user_hero_ship_inventory DROP CONSTRAINT IF EXISTS user_hero_ship_inventory_user_id_item_id_key;
ALTER TABLE user_hero_ship_inventory ADD CONSTRAINT user_hero_ship_inventory_user_id_item_id_item_level_key UNIQUE (user_id, item_id, item_level);

-- Ultima vez que se aplico regeneracion pasiva de HP
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS last_regen_at timestamptz DEFAULT now();

-- Nivel por slot equipado
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS weapon_item_level integer NOT NULL DEFAULT 1;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS shield_item_level integer NOT NULL DEFAULT 1;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS module_item_level integer NOT NULL DEFAULT 1;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS reactor_item_level integer NOT NULL DEFAULT 1;

-- Stats y nivel minimo para items
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS attack_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS defense_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS shield_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS speed_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS loot_bonus integer NOT NULL DEFAULT 0;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 1;
ALTER TABLE hero_ship_items ADD COLUMN IF NOT EXISTS slot_type text NOT NULL DEFAULT 'module'
  CHECK (slot_type IN ('weapon', 'shield', 'module', 'reactor', 'consumable'));

-- Slots de equipamiento en la nave
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS weapon_slot uuid REFERENCES hero_ship_items(id) ON DELETE SET NULL;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS shield_slot uuid REFERENCES hero_ship_items(id) ON DELETE SET NULL;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS module_slot uuid REFERENCES hero_ship_items(id) ON DELETE SET NULL;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS reactor_slot uuid REFERENCES hero_ship_items(id) ON DELETE SET NULL;

-- Reemplazar items con equipamiento
DELETE FROM user_hero_ship_inventory;
DELETE FROM hero_ship_items;

INSERT INTO hero_ship_items (name, rarity, base_probability, description, is_repair_kit, repair_amount, attack_bonus, defense_bonus, shield_bonus, speed_bonus, loot_bonus, min_level, slot_type) VALUES
  -- Kits de reparacion (consumables)
  ('Kit de Reparacion I', 'common', 25, 'Repara el 25% del HP maximo', true, 25, 0,0,0,0,0, 1, 'consumable'),
  ('Kit de Reparacion II', 'rare', 15, 'Repara el 50% del HP maximo', true, 50, 0,0,0,0,0, 1, 'consumable'),
  ('Kit de Reparacion III', 'epic', 8, 'Repara el 75% del HP maximo', true, 75, 0,0,0,0,0, 1, 'consumable'),
  ('Kit de Reparacion IV', 'legendary', 3, 'Repara el 100% del HP maximo', true, 100, 0,0,0,0,0, 1, 'consumable'),
  -- Armas (weapon slot) — escalado por nivel: common 1 stat, rare 2, epic 3, legendary 5
  ('Canon Ligero', 'common', 20, 'Arma ligera. +2 ataque', false, 0, 2,0,0,0,0, 1, 'weapon'),
  ('Canon de Plasma', 'rare', 12, 'Arma de plasma. +6 ataque, +2 defensa', false, 0, 6,2,0,0,0, 3, 'weapon'),
  ('Canon de Iones', 'epic', 6, 'Arma ionica. +15 ataque, +6 defensa, +3 velocidad', false, 0, 15,6,0,3,0, 5, 'weapon'),
  ('Cañon de Antimateria', 'legendary', 2, 'Arma suprema. +40 atq, +15 def, +10 esc, +5 vel, +3 botin', false, 0, 40,15,10,5,3, 10, 'weapon'),
  -- Escudos (shield slot)
  ('Escudo Basico', 'common', 20, 'Escudo simple. +2 defensa, +1 escudo', false, 0, 0,2,1,0,0, 1, 'shield'),
  ('Escudo Reforzado', 'rare', 12, 'Escudo resistente. +2 ataque, +6 defensa, +3 escudo', false, 0, 2,6,3,0,0, 3, 'shield'),
  ('Escudo de Energia', 'epic', 6, 'Campo energetico. +5 atq, +15 defensa, +8 escudo, +3 vel', false, 0, 5,15,8,3,0, 5, 'shield'),
  ('Escudo Cuantico', 'legendary', 2, 'Escudo dimensional. +15 atq, +40 def, +25 esc, +8 vel, +5 bot', false, 0, 15,40,25,8,5, 10, 'shield'),
  -- Modulos (module slot)
  ('Turbo Basico', 'common', 20, 'Acelerador simple. +2 velocidad', false, 0, 0,0,0,2,0, 1, 'module'),
  ('Turbo Avanzado', 'rare', 12, 'Acelerador mejorado. +2 atq, +1 def, +6 vel', false, 0, 2,1,0,6,0, 3, 'module'),
  ('Turbo Hiperespacial', 'epic', 6, 'Motor curvatura. +6 atq, +3 def, +2 esc, +15 vel', false, 0, 6,3,2,15,0, 5, 'module'),
  ('Turbo Dimensional', 'legendary', 2, 'Motor interdimensional. +15 atq, +10 def, +5 esc, +40 vel, +5 bot', false, 0, 15,10,5,40,5, 10, 'module'),
  -- Reactores (reactor slot)
  ('Reactor Simple', 'common', 20, 'Generador simple. +2 botin', false, 0, 0,0,0,0,2, 1, 'reactor'),
  ('Reactor de Fusion', 'rare', 12, 'Fusion nuclear. +1 atq, +3 esc, +2 vel, +6 botin', false, 0, 1,0,3,2,6, 3, 'reactor'),
  ('Reactor de Materia Oscura', 'epic', 6, 'Materia oscura. +3 atq, +8 esc, +5 vel, +15 botin', false, 0, 3,0,8,5,15, 5, 'reactor'),
  ('Reactor de Singularidad', 'legendary', 2, 'Singularidad. +5 atq, +5 def, +20 esc, +10 vel, +40 botin', false, 0, 5,5,20,10,40, 10, 'reactor');

-- Equipar item (con item_level)
CREATE OR REPLACE FUNCTION equip_hero_item(p_user_id uuid, p_inventory_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_item hero_ship_items%ROWTYPE;
  v_ship record;
  v_old_item_id uuid;
  v_old_item_lvl integer;
  v_slot_col text;
  v_slot_lvl_col text;
BEGIN
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_inv FROM user_hero_ship_inventory WHERE id = p_inventory_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
  END IF;

  SELECT * INTO v_item FROM hero_ship_items WHERE id = v_inv.item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
  END IF;

  IF v_item.is_repair_kit OR v_item.slot_type = 'consumable' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede equipar un consumible');
  END IF;

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', '🚀 No puedes equipar mientras la nave esta en expedicion. Espera a que regrese a la base.');
  END IF;

  IF v_ship.level < v_inv.item_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requiere nivel de nave ' || v_inv.item_level);
  END IF;

  CASE v_item.slot_type
    WHEN 'weapon' THEN v_slot_col := 'weapon_slot'; v_slot_lvl_col := 'weapon_item_level';
    WHEN 'shield' THEN v_slot_col := 'shield_slot'; v_slot_lvl_col := 'shield_item_level';
    WHEN 'module' THEN v_slot_col := 'module_slot'; v_slot_lvl_col := 'module_item_level';
    WHEN 'reactor' THEN v_slot_col := 'reactor_slot'; v_slot_lvl_col := 'reactor_item_level';
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Tipo de item invalido');
  END CASE;

  EXECUTE format('SELECT %I FROM user_hero_ships WHERE user_id = $1', v_slot_col) INTO v_old_item_id USING p_user_id;
  EXECUTE format('SELECT %I FROM user_hero_ships WHERE user_id = $1', v_slot_lvl_col) INTO v_old_item_lvl USING p_user_id;

  IF v_old_item_id IS NOT NULL THEN
    INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
    VALUES (p_user_id, v_old_item_id, v_old_item_lvl, 1)
    ON CONFLICT (user_id, item_id, item_level) DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;
  END IF;

  IF v_inv.quantity <= 1 THEN
    DELETE FROM user_hero_ship_inventory WHERE id = v_inv.id;
  ELSE
    UPDATE user_hero_ship_inventory SET quantity = quantity - 1 WHERE id = v_inv.id;
  END IF;

  EXECUTE format('UPDATE user_hero_ships SET %I = $1, %I = $2, updated_at = now() WHERE user_id = $3',
    v_slot_col, v_slot_lvl_col) USING v_item.id, v_inv.item_level, p_user_id;

  RETURN jsonb_build_object('success', true, 'slot', v_item.slot_type, 'item_name', v_item.name);
END;
$$;

-- Desequipar item (con item_level)
CREATE OR REPLACE FUNCTION unequip_hero_item(p_user_id uuid, p_slot text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ship record;
  v_item_id uuid;
  v_item_lvl integer;
  v_slot_col text;
  v_slot_lvl_col text;
  v_item record;
BEGIN
  PERFORM create_hero_ship(p_user_id);

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', '🚀 No puedes desequipar mientras la nave esta en expedicion. Espera a que regrese a la base.');
  END IF;

  CASE p_slot
    WHEN 'weapon' THEN v_slot_col := 'weapon_slot'; v_slot_lvl_col := 'weapon_item_level';
    WHEN 'shield' THEN v_slot_col := 'shield_slot'; v_slot_lvl_col := 'shield_item_level';
    WHEN 'module' THEN v_slot_col := 'module_slot'; v_slot_lvl_col := 'module_item_level';
    WHEN 'reactor' THEN v_slot_col := 'reactor_slot'; v_slot_lvl_col := 'reactor_item_level';
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Slot invalido');
  END CASE;

  EXECUTE format('SELECT %I FROM user_hero_ships WHERE user_id = $1', v_slot_col) INTO v_item_id USING p_user_id;
  EXECUTE format('SELECT %I FROM user_hero_ships WHERE user_id = $1', v_slot_lvl_col) INTO v_item_lvl USING p_user_id;

  IF v_item_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay item en ese slot');
  END IF;

  SELECT * INTO v_item FROM hero_ship_items WHERE id = v_item_id;

  INSERT INTO user_hero_ship_inventory (user_id, item_id, item_level, quantity)
  VALUES (p_user_id, v_item_id, v_item_lvl, 1)
  ON CONFLICT (user_id, item_id, item_level) DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;

  EXECUTE format('UPDATE user_hero_ships SET %I = NULL, %I = 1, updated_at = now() WHERE user_id = $1',
    v_slot_col, v_slot_lvl_col) USING p_user_id;

  RETURN jsonb_build_object('success', true, 'item_name', v_item.name);
END;
$$;

-- Claim: auto-recompensa, 0-1 item, item_level random
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
  v_rarity text;
  v_common_prob numeric;
  v_rare_prob numeric;
  v_epic_prob numeric;
  v_legendary_prob numeric;
  v_kit_25_prob numeric;
  v_kit_50_prob numeric;
  v_kit_75_prob numeric;
  v_kit_100_prob numeric;
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

  SELECT value::numeric INTO v_common_prob FROM game_settings WHERE key = 'hero_item_common_prob';
  SELECT value::numeric INTO v_rare_prob FROM game_settings WHERE key = 'hero_item_rare_prob';
  SELECT value::numeric INTO v_epic_prob FROM game_settings WHERE key = 'hero_item_epic_prob';
  SELECT value::numeric INTO v_legendary_prob FROM game_settings WHERE key = 'hero_item_legendary_prob';
  SELECT value::numeric INTO v_kit_25_prob FROM game_settings WHERE key = 'hero_repair_kit_25_prob';
  SELECT value::numeric INTO v_kit_50_prob FROM game_settings WHERE key = 'hero_repair_kit_50_prob';
  SELECT value::numeric INTO v_kit_75_prob FROM game_settings WHERE key = 'hero_repair_kit_75_prob';
  SELECT value::numeric INTO v_kit_100_prob FROM game_settings WHERE key = 'hero_repair_kit_100_prob';
  v_common_prob := COALESCE(v_common_prob, 50); v_rare_prob := COALESCE(v_rare_prob, 25);
  v_epic_prob := COALESCE(v_epic_prob, 15); v_legendary_prob := COALESCE(v_legendary_prob, 5);
  v_kit_25_prob := COALESCE(v_kit_25_prob, 25); v_kit_50_prob := COALESCE(v_kit_50_prob, 15);
  v_kit_75_prob := COALESCE(v_kit_75_prob, 8); v_kit_100_prob := COALESCE(v_kit_100_prob, 3);

  PERFORM add_hero_xp(p_user_id, v_expedition.xp_reward);

  UPDATE user_hero_ships SET hp = GREATEST(0, hp - v_expedition.hp_damage), updated_at = now() WHERE user_id = p_user_id;

  IF v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob +
     v_common_prob + v_rare_prob + v_epic_prob + v_legendary_prob > 0 THEN
    v_roll := random() * (
      v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob +
      v_common_prob + v_rare_prob + v_epic_prob + v_legendary_prob
    );
    v_found_item := NULL;
    IF v_roll <= v_kit_25_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion I' LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion II' LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion III' LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion IV' LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob + v_common_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'common' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob + v_common_prob + v_rare_prob THEN
      SELECT * INTO v_found_item FROM hero_ship_items
      WHERE rarity = 'rare' AND slot_type != 'consumable'
      ORDER BY random() LIMIT 1;
    ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob + v_common_prob + v_rare_prob + v_epic_prob THEN
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
      'type', CASE WHEN v_found_item.is_repair_kit THEN 'repair_kit' ELSE 'equipment' END,
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

-- Regeneracion pasiva de HP: 1-10 dias segun hangar + robot + nanobots
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
  WHERE p.user_id = p_user_id;

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

-- get_hero_ship: stats escaladas por item_level de cada slot + regen pasiva
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
  WHERE p.user_id = p_user_id;
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
  ELSE ms := null; END IF;
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

-- get_hero_inventory: devolver item_level y stats escaladas por item_level
CREATE OR REPLACE FUNCTION get_hero_inventory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'inventory_id', inv.id,
    'item_id', it.id,
    'name', it.name,
    'rarity', it.rarity,
    'description', it.description,
    'is_repair_kit', it.is_repair_kit,
    'repair_amount', it.repair_amount,
    'slot_type', it.slot_type,
    'min_level', it.min_level,
    'item_level', inv.item_level,
    'attack_bonus', FLOOR(it.attack_bonus * inv.item_level),
    'defense_bonus', FLOOR(it.defense_bonus * inv.item_level),
    'shield_bonus', FLOOR(it.shield_bonus * inv.item_level),
    'speed_bonus', FLOOR(it.speed_bonus * inv.item_level),
    'loot_bonus', FLOOR(it.loot_bonus * inv.item_level),
    'quantity', inv.quantity
  ) ORDER BY
    CASE it.rarity WHEN 'legendary' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 ELSE 3 END,
    it.name), '[]'::jsonb) INTO v_result
  FROM user_hero_ship_inventory inv
  JOIN hero_ship_items it ON it.id = inv.item_id
  WHERE inv.user_id = p_user_id AND inv.quantity > 0;

  RETURN v_result;
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION equip_hero_item(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION unequip_hero_item(uuid, text) TO authenticated;
