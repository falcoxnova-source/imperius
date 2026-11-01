ALTER TABLE hero_ship_expeditions ADD COLUMN IF NOT EXISTS drop_chance numeric(5,2) NOT NULL DEFAULT 85;

-- New Easy probabilities: common=85, rare=12, epic=2.5, legendary=0.5
UPDATE hero_ship_expeditions SET
  prob_common = 85, prob_rare = 12, prob_epic = 2.5, prob_legendary = 0.5,
  drop_chance = 85
WHERE name = 'Exploracion Cercana';

-- Medium (auto-calc from easy ×0.57/×1.75/×2.25/×3.5 → normalized): 63, 27, 7, 3
UPDATE hero_ship_expeditions SET
  prob_common = 63, prob_rare = 27, prob_epic = 7, prob_legendary = 3,
  drop_chance = 70
WHERE name = 'Incursion Media';

-- Hard (auto-calc from easy ×0.21/×1.5/×4.375/×10 → normalized): 34, 35, 21, 10
UPDATE hero_ship_expeditions SET
  prob_common = 34, prob_rare = 35, prob_epic = 21, prob_legendary = 10,
  drop_chance = 55
WHERE name = 'Expedicion Profunda';

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

  v_kit_25_prob := COALESCE(v_expedition.prob_kit_25, 25);
  v_kit_50_prob := COALESCE(v_expedition.prob_kit_50, 15);
  v_kit_75_prob := COALESCE(v_expedition.prob_kit_75, 8);
  v_kit_100_prob := COALESCE(v_expedition.prob_kit_100, 3);

  v_drop_chance := COALESCE(v_expedition.drop_chance, 85);

  PERFORM add_hero_xp(p_user_id, v_expedition.xp_reward);

  UPDATE user_hero_ships SET hp = GREATEST(0, hp - v_expedition.hp_damage), updated_at = now() WHERE user_id = p_user_id;

  IF random() * 100 <= v_drop_chance AND
     v_kit_25_prob + v_kit_50_prob + v_kit_75_prob + v_kit_100_prob +
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
    'prob_kit_25', prob_kit_25,
    'prob_kit_50', prob_kit_50,
    'prob_kit_75', prob_kit_75,
    'prob_kit_100', prob_kit_100,
    'drop_chance', drop_chance
  ) ORDER BY duration_minutes), '[]'::jsonb) INTO v_result
  FROM hero_ship_expeditions;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_hero_expedition(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_hero_expeditions() TO authenticated;
