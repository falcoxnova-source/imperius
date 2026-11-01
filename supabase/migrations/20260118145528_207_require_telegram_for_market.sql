/*
  # Require Telegram for Market Operations
  
  ## Summary
  Adds the same Telegram verification requirement to market operations as withdrawals.
  This prevents multi-account abuse where players create multiple accounts to trade
  resources at low prices to their main account.
  
  ## Changes
  - `create_market_listing`: Now requires Telegram linked and group membership
  - `purchase_market_listing`: Now requires Telegram linked and group membership
  
  ## Security
  - One Telegram account = one account that can use market
  - Players can still play without Telegram, just cannot trade
  - Same validation logic as withdrawal function
*/

-- Update create_market_listing with Telegram requirement
CREATE OR REPLACE FUNCTION create_market_listing(
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_total_price numeric;
  v_current_amount numeric;
  v_ship_quantity int;
  v_user_dm int;
  v_listing_id uuid;
  v_telegram_id bigint;
  v_is_member boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Check if user has Telegram linked
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;
  
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.',
      'requires_telegram', true
    );
  END IF;
  
  -- Check if user is currently a member of the Telegram group
  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';
  
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.',
      'requires_telegram', true
    );
  END IF;
  
  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad debe ser mayor a 0');
  END IF;
  
  IF p_price_per_unit <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio debe ser mayor a 0');
  END IF;
  
  IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de listado invalido');
  END IF;
  
  IF p_listing_type != 'dark_matter' THEN
    IF p_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
    END IF;
  END IF;
  
  v_total_price := p_quantity * p_price_per_unit;
  
  IF p_listing_type = 'resource' THEN
    IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
    END IF;
    
    IF p_item_code = 'metal' THEN
      SELECT metal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente');
      END IF;
      
    ELSIF p_item_code = 'crystal' THEN
      SELECT crystal INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente');
      END IF;
      
    ELSIF p_item_code = 'deuterium' THEN
      SELECT deuterium INTO v_current_amount FROM planet_resources WHERE planet_id = p_planet_id;
      IF v_current_amount IS NULL OR v_current_amount < p_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente');
      END IF;
    END IF;
    
  ELSIF p_listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_user_dm FROM profiles WHERE id = v_user_id;
    IF v_user_dm IS NULL OR v_user_dm < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
    END IF;
    UPDATE profiles SET dark_matter = dark_matter - p_quantity WHERE id = v_user_id;
    
  ELSIF p_listing_type = 'ship' THEN
    IF NOT EXISTS (SELECT 1 FROM ship_types WHERE code = p_item_code) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido');
    END IF;
    
    SELECT ps.quantity INTO v_ship_quantity
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE ps.planet_id = p_planet_id AND st.code = p_item_code;
    
    IF v_ship_quantity IS NULL OR v_ship_quantity < p_quantity THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes');
    END IF;
  END IF;
  
  INSERT INTO market_listings (seller_id, listing_type, item_code, quantity, price_per_unit, total_price, planet_id, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, p_price_per_unit, v_total_price, p_planet_id, 'active')
  RETURNING id INTO v_listing_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta creada exitosamente. Los recursos permanecen en tu planeta hasta que se vendan.',
    'listing_id', v_listing_id
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear oferta: ' || SQLERRM);
END;
$$;

-- Update purchase_market_listing with Telegram requirement
CREATE OR REPLACE FUNCTION purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_listing RECORD;
  v_buyer_planet_id uuid;
  v_purchase_qty integer;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_admin_id uuid;
  v_fee numeric;
  v_jackpot_contribution_rate numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_seller_amount numeric;
  v_ship_type_id integer;
  v_market_fee_percent numeric;
  v_referral_commission_percent numeric;
  v_referrer_id uuid;
  v_referral_commission numeric;
  v_referral_resource_amount bigint;
  v_referrer_planet_id uuid;
  v_transaction_id uuid;
  v_seller_resources RECORD;
  v_seller_ship_qty integer;
  v_telegram_id bigint;
  v_is_member boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check if user has Telegram linked
  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;
  
  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado. Ve a la seccion de Tareas para vincular tu cuenta.',
      'requires_telegram', true
    );
  END IF;
  
  -- Check if user is currently a member of the Telegram group
  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';
  
  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado. Unete al grupo desde la seccion de Tareas.',
      'requires_telegram', true
    );
  END IF;

  v_market_fee_percent := get_market_fee_percent();
  v_referral_commission_percent := get_referral_commission_percent();
  
  SELECT contribution_rate INTO v_jackpot_contribution_rate FROM jackpot_config WHERE id = 1;
  v_jackpot_contribution_rate := COALESCE(v_jackpot_contribution_rate, 10);

  SELECT * INTO v_listing 
  FROM market_listings 
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  IF v_listing.seller_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot buy your own listing');
  END IF;

  v_purchase_qty := COALESCE(p_quantity, v_listing.quantity::integer);
  IF v_purchase_qty > v_listing.quantity OR v_purchase_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
  END IF;

  v_total_price := v_listing.price_per_unit * v_purchase_qty;

  IF v_total_price > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total price exceeds maximum');
  END IF;

  SELECT fxu_balance INTO v_buyer_fxu 
  FROM profiles 
  WHERE id = v_user_id 
  FOR UPDATE;

  IF v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU balance');
  END IF;

  SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_user_id AND is_main_planet = true LIMIT 1;
  IF v_buyer_planet_id IS NULL AND v_listing.listing_type != 'dark_matter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No main planet found');
  END IF;

  IF v_listing.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources 
    WHERE planet_id = v_listing.planet_id
    FOR UPDATE;
    
    IF v_listing.item_code = 'metal' AND v_seller_resources.metal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente metal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'crystal' AND v_seller_resources.crystal < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente cristal (posiblemente fue atacado)');
    ELSIF v_listing.item_code = 'deuterium' AND v_seller_resources.deuterium < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficiente deuterio (posiblemente fue atacado)');
    END IF;
    
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_purchase_qty WHERE planet_id = v_listing.planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ship type not found');
    END IF;
    
    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;
    
    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_purchase_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'El vendedor ya no tiene suficientes naves (posiblemente fueron destruidas en combate)');
    END IF;
    
    UPDATE planet_ships 
    SET quantity = quantity - v_purchase_qty 
    WHERE planet_id = v_listing.planet_id AND ship_type_id = v_ship_type_id;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    NULL;
  END IF;

  v_fee := v_total_price * (v_market_fee_percent / 100);
  v_jackpot_amount := floor(v_fee * (v_jackpot_contribution_rate / 100));
  v_admin_fee := v_fee - v_jackpot_amount;
  v_seller_amount := v_total_price - v_fee;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee', 
      v_admin_fee,
      'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (' || v_market_fee_percent || '% fee, ' || (100 - v_jackpot_contribution_rate) || '% to admin)',
      v_listing.seller_id,
      p_listing_id
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_listing.seller_id);
  END IF;

  IF v_listing.listing_type = 'ship' THEN
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_buyer_planet_id, v_ship_type_id, v_purchase_qty)
    ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_purchase_qty;

  ELSIF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_purchase_qty WHERE planet_id = v_buyer_planet_id;
    END IF;

  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_purchase_qty WHERE id = v_user_id;
  END IF;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_user_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_purchase_qty, v_total_price)
  RETURNING id INTO v_transaction_id;

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;

  IF v_referrer_id IS NOT NULL AND v_referral_commission_percent > 0 THEN
    IF v_listing.listing_type = 'resource' THEN
      v_referral_resource_amount := FLOOR(v_purchase_qty * v_referral_commission_percent / 100);

      IF v_referral_resource_amount >= 1 THEN
        SELECT id INTO v_referrer_planet_id 
        FROM planets 
        WHERE user_id = v_referrer_id AND is_main_planet = true 
        LIMIT 1;

        IF v_referrer_planet_id IS NOT NULL THEN
          IF v_listing.item_code = 'metal' THEN
            UPDATE planet_resources 
            SET metal = metal + v_referral_resource_amount 
            WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'crystal' THEN
            UPDATE planet_resources 
            SET crystal = crystal + v_referral_resource_amount 
            WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'deuterium' THEN
            UPDATE planet_resources 
            SET deuterium = deuterium + v_referral_resource_amount 
            WHERE planet_id = v_referrer_planet_id;
          END IF;

          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
          VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'resource', v_listing.item_code, v_referral_resource_amount, 0);
        END IF;
      END IF;

    ELSE
      v_referral_commission := FLOOR(v_total_price * v_referral_commission_percent / 100);

      IF v_referral_commission >= 1 THEN
        UPDATE profiles 
        SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
        WHERE id = v_referrer_id;

        INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
        VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'fxu', 'fxu', v_referral_commission, v_referral_commission);
      END IF;
    END IF;
  END IF;

  IF v_purchase_qty = v_listing.quantity THEN
    UPDATE market_listings SET status = 'sold', updated_at = now() WHERE id = p_listing_id;
  ELSE
    UPDATE market_listings SET quantity = quantity - v_purchase_qty, total_price = (quantity - v_purchase_qty) * price_per_unit, updated_at = now() WHERE id = p_listing_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'quantity', v_purchase_qty, 
    'total_price', v_total_price,
    'jackpot_contribution', v_jackpot_amount
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_market_listing(text, text, bigint, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION purchase_market_listing(uuid, integer) TO authenticated;
