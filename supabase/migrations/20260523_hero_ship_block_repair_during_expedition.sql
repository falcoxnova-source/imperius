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

  IF EXISTS (SELECT 1 FROM hero_ship_active_expedition WHERE user_id = p_user_id AND claimed = false) THEN
    RETURN jsonb_build_object('success', false, 'error', '🚀 No puedes reparar mientras la nave esta en expedicion');
  END IF;

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

GRANT EXECUTE ON FUNCTION use_hero_repair_kit(uuid, uuid) TO authenticated;
