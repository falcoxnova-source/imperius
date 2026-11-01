-- Per-expedition loot probability columns
ALTER TABLE hero_ship_expeditions ADD COLUMN IF NOT EXISTS prob_common numeric NOT NULL DEFAULT 70;
ALTER TABLE hero_ship_expeditions ADD COLUMN IF NOT EXISTS prob_rare numeric NOT NULL DEFAULT 20;
ALTER TABLE hero_ship_expeditions ADD COLUMN IF NOT EXISTS prob_epic numeric NOT NULL DEFAULT 8;
ALTER TABLE hero_ship_expeditions ADD COLUMN IF NOT EXISTS prob_legendary numeric NOT NULL DEFAULT 2;

-- Easy: common 70, rare 20, epic 8, legendary 2
UPDATE hero_ship_expeditions SET
  prob_common = 70, prob_rare = 20, prob_epic = 8, prob_legendary = 2
WHERE name = 'Exploracion Cercana';

-- Medium: common 40, rare 35, epic 18, legendary 7
UPDATE hero_ship_expeditions SET
  prob_common = 40, prob_rare = 35, prob_epic = 18, prob_legendary = 7
WHERE name = 'Incursion Media';

-- Hard: common 15, rare 30, epic 35, legendary 20
UPDATE hero_ship_expeditions SET
  prob_common = 15, prob_rare = 30, prob_epic = 35, prob_legendary = 20
WHERE name = 'Expedicion Profunda';

-- Update claim_hero_expedition to use per-expedition probs
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

  -- Per-expedition loot probabilities
  v_common_prob := COALESCE(v_expedition.prob_common, 70);
  v_rare_prob := COALESCE(v_expedition.prob_rare, 20);
  v_epic_prob := COALESCE(v_expedition.prob_epic, 8);
  v_legendary_prob := COALESCE(v_expedition.prob_legendary, 2);

  -- Kit probabilities remain global (from game_settings)
  SELECT value::numeric INTO v_kit_25_prob FROM game_settings WHERE key = 'hero_repair_kit_25_prob';
  SELECT value::numeric INTO v_kit_50_prob FROM game_settings WHERE key = 'hero_repair_kit_50_prob';
  SELECT value::numeric INTO v_kit_75_prob FROM game_settings WHERE key = 'hero_repair_kit_75_prob';
  SELECT value::numeric INTO v_kit_100_prob FROM game_settings WHERE key = 'hero_repair_kit_100_prob';
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

-- Update get_hero_expeditions to return probability columns
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
    'prob_legendary', prob_legendary
  ) ORDER BY duration_minutes), '[]'::jsonb) INTO v_result
  FROM hero_ship_expeditions;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_hero_expedition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_expeditions() TO authenticated;
