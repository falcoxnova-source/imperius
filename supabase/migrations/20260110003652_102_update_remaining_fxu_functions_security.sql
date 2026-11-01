/*
  # Update remaining functions to set fxu_update context

  These functions modify fxu_balance and need to set the security context
  to pass the protection trigger.
*/

-- Update fail_withdrawal (refunds FXU on failed withdrawal)
DROP FUNCTION IF EXISTS public.fail_withdrawal(uuid, text);
CREATE OR REPLACE FUNCTION public.fail_withdrawal(p_tx_id uuid, p_error_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx wallet_transactions%ROWTYPE;
  v_role text;
  v_admin_id uuid;
  v_fee_amount numeric;
BEGIN
  -- SECURITY: Only service_role can call this function
  v_role := current_setting('role', true);
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_tx FROM wallet_transactions WHERE id = p_tx_id;
  
  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  v_fee_amount := COALESCE(v_tx.fxu_amount - v_tx.amount, 0);

  PERFORM set_config('app.fxu_update_allowed', 'fail_withdrawal', true);

  UPDATE profiles 
  SET fxu_balance = fxu_balance + v_tx.fxu_amount,
      updated_at = now()
  WHERE id = v_tx.user_id;

  IF v_fee_amount > 0 THEN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
    IF v_admin_id IS NOT NULL THEN
      UPDATE profiles 
      SET fxu_balance = GREATEST(fxu_balance - v_fee_amount, 0)
      WHERE id = v_admin_id;
    END IF;
  END IF;

  UPDATE wallet_transactions
  SET status = 'failed',
      error_message = p_error_message,
      updated_at = now()
  WHERE id = p_tx_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Update instant_complete_building
DROP FUNCTION IF EXISTS public.instant_complete_building(uuid);
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
  v_fxu_cost := calculate_fxu_cost(v_remaining_seconds);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_building', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  UPDATE building_queue SET end_time = now() - interval '1 second' WHERE id = p_queue_id;
  PERFORM complete_building_upgrade(p_queue_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$;

-- Update instant_complete_research
DROP FUNCTION IF EXISTS public.instant_complete_research(uuid);
CREATE OR REPLACE FUNCTION public.instant_complete_research(p_research_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_research RECORD;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_remaining_seconds integer;
  v_admin_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT ur.*, rt.name as research_name
  INTO v_research
  FROM user_research ur
  JOIN research_types rt ON ur.research_type_id = rt.id
  WHERE ur.id = p_research_id AND ur.is_researching = true;

  IF v_research IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Research not found or not in progress');
  END IF;

  IF v_research.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your research');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_research.research_end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_research(v_remaining_seconds);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_research', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  UPDATE user_research 
  SET level = level + 1, 
      is_researching = false, 
      research_end_time = NULL,
      updated_at = now()
  WHERE id = p_research_id;

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$;

-- Update instant_complete_shipyard_item
DROP FUNCTION IF EXISTS public.instant_complete_shipyard_item(uuid);
CREATE OR REPLACE FUNCTION public.instant_complete_shipyard_item(p_queue_id uuid)
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
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT sq.*, p.user_id as planet_owner
  INTO v_queue_item
  FROM shipyard_queue sq
  JOIN planets p ON sq.planet_id = p.id
  WHERE sq.id = p_queue_id AND sq.status = 'building';

  IF v_queue_item IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Queue item not found or not building');
  END IF;

  IF v_queue_item.planet_owner != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not your planet');
  END IF;

  v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_queue_item.end_time - now()))::integer);
  v_fxu_cost := calculate_fxu_cost_shipyard(v_remaining_seconds);

  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  IF v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU', 'required', v_fxu_cost, 'available', v_current_fxu);
  END IF;

  PERFORM set_config('app.fxu_update_allowed', 'instant_complete_shipyard_item', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_cost WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_cost WHERE id = v_admin_id;
  END IF;

  UPDATE shipyard_queue SET end_time = now() - interval '1 second' WHERE id = p_queue_id;
  PERFORM complete_shipyard_item(p_queue_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_cost);
END;
$function$;

-- Drop old versions
DROP FUNCTION IF EXISTS public.request_withdrawal_v2(numeric, text);

-- Update purchase_market_listing
DROP FUNCTION IF EXISTS public.purchase_market_listing(uuid, integer);
DROP FUNCTION IF EXISTS public.purchase_market_listing(uuid);
CREATE OR REPLACE FUNCTION public.purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_listing RECORD;
  v_buyer_planet_id uuid;
  v_purchase_qty integer;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_admin_id uuid;
  v_fee numeric;
  v_seller_amount numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_listing FROM market_listings WHERE id = p_listing_id AND status = 'active';
  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  IF v_listing.seller_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot buy your own listing');
  END IF;

  v_purchase_qty := COALESCE(p_quantity, v_listing.quantity);
  IF v_purchase_qty > v_listing.quantity OR v_purchase_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  v_total_price := v_listing.price_per_unit * v_purchase_qty;

  SELECT fxu_balance INTO v_buyer_fxu FROM profiles WHERE id = v_user_id;
  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  IF v_buyer_planet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  v_fee := v_total_price * 0.05;
  v_seller_amount := v_total_price - v_fee;

  PERFORM set_config('app.fxu_update_allowed', 'purchase_market_listing', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee WHERE id = v_admin_id;
  END IF;

  IF v_listing.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_listing.item_type_id, v_purchase_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_purchase_qty;
  ELSIF v_listing.listing_type = 'resource' THEN
    IF v_listing.resource_type = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.resource_type = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.resource_type = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    END IF;
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'quantity', v_purchase_qty, 'total_price', v_total_price);
END;
$function$;
