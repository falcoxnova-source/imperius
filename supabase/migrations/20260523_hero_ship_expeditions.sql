-- HP de la nave
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS hp integer NOT NULL DEFAULT 100;
ALTER TABLE user_hero_ships ADD COLUMN IF NOT EXISTS hp_max integer NOT NULL DEFAULT 100;

-- Catalogo de items
CREATE TABLE IF NOT EXISTS hero_ship_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  base_probability numeric NOT NULL DEFAULT 5,
  description text,
  is_repair_kit boolean NOT NULL DEFAULT false,
  repair_amount integer DEFAULT 0,
  image_url text,
  created_at timestamptz DEFAULT now()
);

-- Inventario del jugador
CREATE TABLE IF NOT EXISTS user_hero_ship_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES hero_ship_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Configuracion de expediciones
CREATE TABLE IF NOT EXISTS hero_ship_expeditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_minutes integer NOT NULL,
  xp_reward integer NOT NULL,
  hp_damage integer NOT NULL,
  min_level integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Expedicion activa del jugador
CREATE TABLE IF NOT EXISTS hero_ship_active_expedition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expedition_id uuid NOT NULL REFERENCES hero_ship_expeditions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  returns_at timestamptz NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  UNIQUE(user_id)
);

-- Configs de probabilidad
INSERT INTO game_settings (key, value, description)
VALUES
  ('hero_item_common_prob', '50', 'Probabilidad base item comun (%)'),
  ('hero_item_rare_prob', '25', 'Probabilidad base item raro (%)'),
  ('hero_item_epic_prob', '15', 'Probabilidad base item epico (%)'),
  ('hero_item_legendary_prob', '5', 'Probabilidad base item legendario (%)'),
  ('hero_repair_kit_25_prob', '25', 'Probabilidad kit reparacion 25%'),
  ('hero_repair_kit_50_prob', '15', 'Probabilidad kit reparacion 50%'),
  ('hero_repair_kit_75_prob', '8', 'Probabilidad kit reparacion 75%'),
  ('hero_repair_kit_100_prob', '3', 'Probabilidad kit reparacion 100%')
ON CONFLICT (key) DO NOTHING;

-- Items por defecto
INSERT INTO hero_ship_items (name, rarity, base_probability, description, is_repair_kit, repair_amount) VALUES
  ('Kit de Reparacion I', 'common', 25, 'Repara el 25% del HP maximo de la nave', true, 25),
  ('Kit de Reparacion II', 'rare', 15, 'Repara el 50% del HP maximo de la nave', true, 50),
  ('Kit de Reparacion III', 'epic', 8, 'Repara el 75% del HP maximo de la nave', true, 75),
  ('Kit de Reparacion IV', 'legendary', 3, 'Repara el 100% del HP maximo de la nave', true, 100),
  ('Chatarra de Nave', 'common', 30, 'Fragmentos de nave alienigena. Vendible en mercado', false, 0),
  ('Cristal de Energia', 'common', 25, 'Cristal con energia pura. Vendible en mercado', false, 0),
  ('Aleacion Reforzada', 'rare', 15, 'Metal ultraresistente. Vendible en mercado', false, 0),
  ('Nucleo de Antimateria', 'rare', 12, 'Fuente de energia avanzada. Vendible en mercado', false, 0),
  ('Modulo de Hipervelocidad', 'epic', 8, 'Tecnologia de salto interdimensional. Vendible en mercado', false, 0),
  ('Reliquia Ancestral', 'legendary', 3, 'Artefacto de una civilizacion olvidada. Altamente valioso', false, 0)
ON CONFLICT DO NOTHING;

-- Expediciones por defecto
INSERT INTO hero_ship_expeditions (name, duration_minutes, xp_reward, hp_damage, min_level) VALUES
  ('Exploracion Cercana', 15, 20, 5, 1),
  ('Incursion Media', 30, 50, 15, 3),
  ('Expedicion Profunda', 60, 120, 35, 5)
ON CONFLICT DO NOTHING;

-- Iniciar expedicion
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
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave esta daniada. Reparala antes de salir');
  END IF;

  SELECT * INTO v_expedition FROM hero_ship_expeditions WHERE id = p_expedition_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Expedicion no encontrada');
  END IF;

  IF v_ship.level < v_expedition.min_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nivel minimo: ' || v_expedition.min_level);
  END IF;

  SELECT * INTO v_active FROM hero_ship_active_expedition WHERE user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes una expedicion en curso');
  END IF;

  INSERT INTO hero_ship_active_expedition (user_id, expedition_id, started_at, returns_at)
  VALUES (p_user_id, p_expedition_id, now(), now() + (v_expedition.duration_minutes || ' minutes')::interval);

  RETURN jsonb_build_object(
    'success', true,
    'returns_at', (now() + (v_expedition.duration_minutes || ' minutes')::interval)::text,
    'duration_minutes', v_expedition.duration_minutes
  );
END;
$$;

-- Reclamar expedicion completada
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
  v_scale numeric;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  v_lvl := GREATEST(v_ship.level, 1);
  v_scale := 1 + (v_lvl - 1) * 0.1;
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

  -- Anadir XP
  PERFORM add_hero_xp(p_user_id, v_expedition.xp_reward);

  -- Aplicar dano
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  UPDATE user_hero_ships SET hp = GREATEST(0, hp - v_expedition.hp_damage), hp_max = v_ship.hp_max, updated_at = now() WHERE user_id = p_user_id;

  -- 0 o 1 item: intentar kit primero, si no item normal
  v_roll := random() * 100;
  v_found_item := NULL;
  IF v_roll <= v_kit_25_prob THEN
    SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion I' LIMIT 1;
  ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob THEN
    SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion II' LIMIT 1;
  ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob THEN
    SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion III' LIMIT 1;
  ELSIF v_roll <= v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob THEN
    SELECT * INTO v_found_item FROM hero_ship_items WHERE name = 'Kit de Reparacion IV' LIMIT 1;
  END IF;

  IF FOUND THEN
    INSERT INTO user_hero_ship_inventory (user_id, item_id, quantity) VALUES (p_user_id, v_found_item.id, 1)
    ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;
    v_reward_items := jsonb_build_array(jsonb_build_object(
      'name', v_found_item.name, 'rarity', v_found_item.rarity,
      'type', 'repair_kit', 'slot_type', v_found_item.slot_type,
      'attack_bonus', FLOOR(v_found_item.attack_bonus * v_scale),
      'defense_bonus', FLOOR(v_found_item.defense_bonus * v_scale),
      'shield_bonus', FLOOR(v_found_item.shield_bonus * v_scale),
      'speed_bonus', FLOOR(v_found_item.speed_bonus * v_scale),
      'loot_bonus', FLOOR(v_found_item.loot_bonus * v_scale)
    ));
  ELSE
    -- Si no hay kit, item equipable por rareza
    v_roll := random() * 100;
    IF v_roll <= v_legendary_prob THEN v_rarity := 'legendary';
    ELSIF v_roll <= v_legendary_prob + v_epic_prob THEN v_rarity := 'epic';
    ELSIF v_roll <= v_legendary_prob + v_epic_prob + v_rare_prob THEN v_rarity := 'rare';
    ELSE v_rarity := 'common';
    END IF;

    SELECT * INTO v_found_item FROM hero_ship_items
    WHERE rarity = v_rarity AND is_repair_kit = false
    ORDER BY random() LIMIT 1;
    IF FOUND THEN
      INSERT INTO user_hero_ship_inventory (user_id, item_id, quantity) VALUES (p_user_id, v_found_item.id, 1)
      ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = user_hero_ship_inventory.quantity + 1;
      v_reward_items := jsonb_build_array(jsonb_build_object(
        'name', v_found_item.name, 'rarity', v_found_item.rarity,
        'type', 'equipment', 'slot_type', v_found_item.slot_type,
      'attack_bonus', FLOOR(v_found_item.attack_bonus * v_scale),
      'defense_bonus', FLOOR(v_found_item.defense_bonus * v_scale),
      'shield_bonus', FLOOR(v_found_item.shield_bonus * v_scale),
      'speed_bonus', FLOOR(v_found_item.speed_bonus * v_scale),
      'loot_bonus', FLOOR(v_found_item.loot_bonus * v_scale)
      ));
    END IF;
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

-- Usar kit de reparacion
CREATE OR REPLACE FUNCTION use_hero_repair_kit(p_user_id uuid, p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv record;
  v_item record;
  v_ship record;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_inv FROM user_hero_ship_inventory WHERE user_id = p_user_id AND item_id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_inv.quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes ese item');
  END IF;

  SELECT * INTO v_item FROM hero_ship_items WHERE id = p_item_id;
  IF NOT v_item.is_repair_kit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ese item no es un kit de reparacion');
  END IF;

  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id FOR UPDATE;

  IF v_ship.hp >= v_ship.hp_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tu nave ya esta al maximo de HP');
  END IF;

  UPDATE user_hero_ships SET hp = LEAST(hp_max, hp + FLOOR(hp_max * v_item.repair_amount / 100)), updated_at = now() WHERE user_id = p_user_id;

  IF v_inv.quantity <= 1 THEN
    DELETE FROM user_hero_ship_inventory WHERE id = v_inv.id;
  ELSE
    UPDATE user_hero_ship_inventory SET quantity = quantity - 1 WHERE id = v_inv.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'hp_repaired', FLOOR(v_ship.hp_max * v_item.repair_amount / 100),
    'hp_current', LEAST(v_ship.hp_max, v_ship.hp + FLOOR(v_ship.hp_max * v_item.repair_amount / 100))
  );
END;
$$;

-- Obtener inventario de items (stats escaladas por nivel)
CREATE OR REPLACE FUNCTION get_hero_inventory(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_ship record;
  v_lvl integer;
  v_scale numeric;
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;
  v_lvl := GREATEST(v_ship.level, 1);
  v_scale := 1 + (v_lvl - 1) * 0.1;

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
    'attack_bonus', FLOOR(it.attack_bonus * v_scale),
    'defense_bonus', FLOOR(it.defense_bonus * v_scale),
    'shield_bonus', FLOOR(it.shield_bonus * v_scale),
    'speed_bonus', FLOOR(it.speed_bonus * v_scale),
    'loot_bonus', FLOOR(it.loot_bonus * v_scale),
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

-- Obtener expedicion activa
CREATE OR REPLACE FUNCTION get_hero_active_expedition(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active record;
BEGIN
  SELECT a.*, e.name, e.duration_minutes, e.xp_reward, e.hp_damage
  INTO v_active
  FROM hero_ship_active_expedition a
  JOIN hero_ship_expeditions e ON e.id = a.expedition_id
  WHERE a.user_id = p_user_id AND a.claimed = false;

  IF NOT FOUND THEN
    RETURN 'null'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'id', v_active.id,
    'expedition_name', v_active.name,
    'duration_minutes', v_active.duration_minutes,
    'xp_reward', v_active.xp_reward,
    'hp_damage', v_active.hp_damage,
    'started_at', v_active.started_at::text,
    'returns_at', v_active.returns_at::text,
    'can_claim', now() >= v_active.returns_at,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_active.returns_at - now())))
  );
END;
$$;

-- Obtener expediciones disponibles
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
    'min_level', min_level
  ) ORDER BY duration_minutes), '[]'::jsonb) INTO v_result
  FROM hero_ship_expeditions;

  RETURN v_result;
END;
$$;

-- Actualizar get_hero_ship para incluir HP
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
BEGIN
  PERFORM create_hero_ship(p_user_id);
  SELECT * INTO v_ship FROM user_hero_ships WHERE user_id = p_user_id;

  v_total_points := (v_ship.level - 1) * 10;
  v_total_points := GREATEST(v_total_points, v_ship.attack_points + v_ship.defense_points + v_ship.shield_points + v_ship.speed_points);

  SELECT COALESCE(
    (SELECT value::integer FROM game_settings WHERE key = 'fxu_hero_respec_cost'),
    10000
  ) INTO v_respec_cost;

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
    'respec_cost', v_respec_cost
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION start_hero_expedition(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_hero_expedition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION use_hero_repair_kit(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_inventory(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_active_expedition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_expeditions() TO authenticated;
GRANT SELECT ON TABLE hero_ship_items TO authenticated;
GRANT SELECT ON TABLE hero_ship_expeditions TO authenticated;
