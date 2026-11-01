CREATE OR REPLACE FUNCTION public.instant_complete_building(p_queue_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_queue_item RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_remaining_seconds integer;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot use instant complete while in vacation mode');
  END IF;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bq.*, bt.name as building_name, p.user_id as planet_owner
  INTO v_queue_item
  FROM building_queue bq
  JOIN building_types bt ON bq.building_type_id = bt.id
  JOIN planets p ON bq.planet_id = p.id
  WHERE bq.id = p_queue_id AND bq.status = 'building';

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not building');
  END IF;

  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_building(p_queue_id);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_building', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  -- Reparto empresa/pool/referido del costo
  PERFORM distribute_spend_fee(v_fxu_cost, 'instant_build', 'instant_build',
    v_user_id, 'Edificio: ' || COALESCE(v_queue_item.building_name, ''), p_queue_id);

  UPDATE building_queue SET end_time = now() - interval '1 second' WHERE id = p_queue_id;
  PERFORM complete_building_queue_item(p_queue_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$

