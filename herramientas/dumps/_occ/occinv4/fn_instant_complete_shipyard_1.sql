CREATE OR REPLACE FUNCTION public.instant_complete_shipyard(p_planet_id uuid, p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_queue_item record;
  v_fxu_cost numeric;
  v_current_fxu numeric;
  v_remaining_seconds numeric;
  v_item_name text;
BEGIN
  SELECT user_id INTO v_user_id FROM planets WHERE id = p_planet_id;
  
  IF v_user_id IS NULL OR v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta no encontrado');
  END IF;
  
  SELECT * INTO v_queue_item FROM shipyard_queue WHERE id = p_queue_id AND planet_id = p_planet_id;
  
  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
  END IF;
  
  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now())));
  
  IF v_remaining_seconds <= 600 THEN v_fxu_cost := GREATEST(1, CEIL(v_remaining_seconds / 60));
  ELSIF v_remaining_seconds <= 3600 THEN v_fxu_cost := 10 + CEIL((v_remaining_seconds - 600) / 120);
  ELSIF v_remaining_seconds <= 86400 THEN v_fxu_cost := 35 + CEIL((v_remaining_seconds - 3600) / 300);
  ELSE v_fxu_cost := 100 + CEIL((v_remaining_seconds - 86400) / 600);
  END IF;
  
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'FXU insuficiente', 'required', v_fxu_cost);
  END IF;
  
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;
  
  IF v_queue_item.item_type = 'ship' THEN
    SELECT name INTO v_item_name FROM ship_types WHERE id = v_queue_item.item_id;
  ELSE
    SELECT name INTO v_item_name FROM defense_types WHERE id = v_queue_item.item_id;
  END IF;
  
  PERFORM record_admin_revenue('instant_ship', v_fxu_cost,
    v_queue_item.quantity || 'x ' || COALESCE(v_item_name, 'Item'), v_user_id, v_queue_item.id);
  
  IF v_queue_item.item_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_queue_item.quantity;
  ELSE
    INSERT INTO planet_defenses (planet_id, defense_type_id, quantity)
    VALUES (p_planet_id, v_queue_item.item_id, v_queue_item.quantity)
    ON CONFLICT (planet_id, defense_type_id) DO UPDATE SET quantity = planet_defenses.quantity + v_queue_item.quantity;
  END IF;
  
  DELETE FROM shipyard_queue WHERE id = p_queue_id;
  PERFORM update_user_points(v_user_id);
  
  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost, 'quantity', v_queue_item.quantity);
END;
$function$

