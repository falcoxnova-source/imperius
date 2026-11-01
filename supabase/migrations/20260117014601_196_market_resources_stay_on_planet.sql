/*
  # Market Resources Stay on Planet (Vulnerable to Attack)
  
  ## Summary
  Changes the market system so that listed resources/ships remain on the seller's 
  planet until purchased. This means they can be plundered if the planet is attacked.
  
  ## Changes
  
  ### 1. Migration of Existing Listings
  - Returns all resources/ships from active listings back to their origin planets
  - Existing listings remain active and visible in the market
  - They will now function under the new rules
  
  ### 2. create_market_listing Function
  - NO LONGER deducts resources/ships from the planet
  - Only validates that the seller has sufficient resources/ships
  - Records the listing with reference to the source planet
  
  ### 3. purchase_market_listing Function  
  - NOW deducts resources/ships from seller's planet at purchase time
  - Validates seller still has the resources/ships before completing purchase
  - If seller was attacked and lost resources, purchase fails gracefully
  
  ### 4. cancel_market_listing Function
  - NO LONGER returns resources (they never left the planet)
  - Simply marks the listing as cancelled
  
  ## Security Implications
  - Resources on sale are now vulnerable to being plundered
  - Ships on sale are now vulnerable to being destroyed in combat
  - If resources are plundered, the listing remains active but purchase will fail
  - This adds strategic risk to using the marketplace
  
  ## Important Notes
  - Dark matter listings are unchanged (stored in profile, not planet)
  - The change is transparent to existing sellers - their listings remain active
*/

-- Step 1: Return resources from all active resource listings to origin planets
UPDATE planet_resources pr
SET 
  metal = pr.metal + COALESCE(
    (SELECT SUM(ml.quantity) FROM market_listings ml 
     WHERE ml.planet_id = pr.planet_id 
     AND ml.status = 'active' 
     AND ml.listing_type = 'resource' 
     AND ml.item_code = 'metal'), 0
  ),
  crystal = pr.crystal + COALESCE(
    (SELECT SUM(ml.quantity) FROM market_listings ml 
     WHERE ml.planet_id = pr.planet_id 
     AND ml.status = 'active' 
     AND ml.listing_type = 'resource' 
     AND ml.item_code = 'crystal'), 0
  ),
  deuterium = pr.deuterium + COALESCE(
    (SELECT SUM(ml.quantity) FROM market_listings ml 
     WHERE ml.planet_id = pr.planet_id 
     AND ml.status = 'active' 
     AND ml.listing_type = 'resource' 
     AND ml.item_code = 'deuterium'), 0
  )
WHERE EXISTS (
  SELECT 1 FROM market_listings ml 
  WHERE ml.planet_id = pr.planet_id 
  AND ml.status = 'active' 
  AND ml.listing_type = 'resource'
);

-- Step 2: Return ships from all active ship listings to origin planets
DO $$
DECLARE
  v_listing RECORD;
  v_ship_type_id integer;
BEGIN
  FOR v_listing IN 
    SELECT ml.*, st.id as ship_type_id
    FROM market_listings ml
    JOIN ship_types st ON st.code = ml.item_code
    WHERE ml.status = 'active' AND ml.listing_type = 'ship'
  LOOP
    INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
    VALUES (v_listing.planet_id, v_listing.ship_type_id, v_listing.quantity)
    ON CONFLICT (planet_id, ship_type_id) 
    DO UPDATE SET quantity = planet_ships.quantity + v_listing.quantity;
  END LOOP;
END $$;

-- Step 3: Return dark matter from active listings to profiles
UPDATE profiles p
SET dark_matter = COALESCE(p.dark_matter, 0) + COALESCE(
  (SELECT SUM(ml.quantity) FROM market_listings ml 
   WHERE ml.seller_id = p.id 
   AND ml.status = 'active' 
   AND ml.listing_type = 'dark_matter'), 0
)
WHERE EXISTS (
  SELECT 1 FROM market_listings ml 
  WHERE ml.seller_id = p.id 
  AND ml.status = 'active' 
  AND ml.listing_type = 'dark_matter'
);

-- Step 4: Update create_market_listing - Only validate, don't deduct
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
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
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

-- Step 5: Update purchase_market_listing - Deduct from seller's planet at purchase time
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
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
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

-- Step 6: Update cancel_market_listing - Don't return resources (they never left)
CREATE OR REPLACE FUNCTION cancel_market_listing(
  p_listing_id uuid,
  p_return_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  IF v_listing.seller_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el dueno de esta oferta');
  END IF;
  
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no se puede cancelar');
  END IF;
  
  UPDATE market_listings
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_listing_id;
  
  IF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_user_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta cancelada exitosamente'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cancelar oferta: ' || SQLERRM);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_market_listing(text, text, bigint, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION purchase_market_listing(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_market_listing(uuid, uuid) TO authenticated;