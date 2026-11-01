/*
  # Referral Commission in Resources (Not FXU)

  ## Overview
  Update the referral system so that:
  - The COMPANY keeps 10% of sale price in FXU
  - The REFERRER earns 5% of the QUANTITY SOLD in RESOURCES (not FXU)

  ## Example
  User sells 1000 Metal for 100 FXU:
  - Seller receives: 90 FXU (90% of price)
  - Company keeps: 10 FXU (10% fee)
  - Referrer gets: 50 Metal (5% of 1000 quantity sold)

  For Dark Matter sales:
  - Referrer gets 5% of Dark Matter quantity

  For Ship sales:
  - Referrer gets 5% of ships (rounded down, minimum 0)

  ## Changes
  - Update `purchase_market_listing` function
  - Referral commission is now in resources/items, not FXU
  - Commission tracking updated to reflect resource type
*/

CREATE OR REPLACE FUNCTION purchase_market_listing(
  p_listing_id uuid,
  p_buyer_planet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_buyer_id uuid;
  v_buyer_profile record;
  v_total_cost numeric;
  v_market_fee_percent numeric := 10;
  v_seller_receives numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_referrer_id uuid;
  v_referrer_planet_id uuid;
  v_referral_commission_qty bigint;
  v_transaction_id uuid;
BEGIN
  v_buyer_id := auth.uid();
  
  IF v_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_buyer_profile
  FROM profiles
  WHERE id = v_buyer_id;
  
  IF v_buyer_profile IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil no encontrado');
  END IF;

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada');
  END IF;
  
  IF v_listing.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta oferta ya no esta disponible');
  END IF;
  
  IF v_listing.seller_id = v_buyer_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes comprar tu propia oferta');
  END IF;
  
  v_total_cost := v_listing.total_price;
  v_seller_receives := v_total_cost * (1 - v_market_fee_percent / 100);
  
  IF COALESCE(v_buyer_profile.fxu_balance, 0) < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'No tienes suficiente FXU. Tienes ' || COALESCE(v_buyer_profile.fxu_balance, 0)::text || ' y necesitas ' || v_total_cost::text
    );
  END IF;
  
  IF v_listing.listing_type != 'dark_matter' THEN
    IF NOT EXISTS (
      SELECT 1 FROM planets WHERE id = p_buyer_planet_id AND user_id = v_buyer_id
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta no valido');
    END IF;
  END IF;
  
  UPDATE market_listings
  SET status = 'sold', updated_at = now()
  WHERE id = p_listing_id;
  
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) - v_total_cost
  WHERE id = v_buyer_id;
  
  UPDATE profiles
  SET fxu_balance = COALESCE(fxu_balance, 0) + v_seller_receives
  WHERE id = v_listing.seller_id;
  
  IF v_listing.listing_type = 'resource' THEN
    IF v_listing.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    ELSIF v_listing.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium + v_listing.quantity WHERE planet_id = p_buyer_planet_id;
    END IF;
    
  ELSIF v_listing.listing_type = 'dark_matter' THEN
    UPDATE profiles
    SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
    WHERE id = v_buyer_id;
    
  ELSIF v_listing.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
    
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;
    
    SELECT * INTO v_existing_ship
    FROM planet_ships
    WHERE planet_id = p_buyer_planet_id AND ship_type_id = v_ship_type_id;
    
    IF FOUND THEN
      UPDATE planet_ships
      SET quantity = quantity + v_listing.quantity
      WHERE planet_id = p_buyer_planet_id AND ship_type_id = v_ship_type_id;
    ELSE
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES (p_buyer_planet_id, v_ship_type_id, v_listing.quantity);
    END IF;
  END IF;
  
  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_listing_id, v_buyer_id, v_listing.seller_id, v_listing.listing_type, v_listing.item_code, v_listing.quantity, v_listing.total_price)
  RETURNING id INTO v_transaction_id;
  
  /*
   * REFERRAL COMMISSION - PAID IN RESOURCES
   * The referrer earns 5% of the QUANTITY sold (in resources/items)
   * The company keeps the 10% fee in FXU
   */
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  
  IF v_referrer_id IS NOT NULL THEN
    v_referral_commission_qty := FLOOR(v_listing.quantity * 5 / 100);
    
    IF v_referral_commission_qty >= 1 THEN
      SELECT id INTO v_referrer_planet_id 
      FROM planets 
      WHERE user_id = v_referrer_id 
      ORDER BY created_at ASC 
      LIMIT 1;
      
      IF v_referrer_planet_id IS NOT NULL THEN
        IF v_listing.listing_type = 'resource' THEN
          IF v_listing.item_code = 'metal' THEN
            UPDATE planet_resources SET metal = metal + v_referral_commission_qty WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'crystal' THEN
            UPDATE planet_resources SET crystal = crystal + v_referral_commission_qty WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'deuterium' THEN
            UPDATE planet_resources SET deuterium = deuterium + v_referral_commission_qty WHERE planet_id = v_referrer_planet_id;
          END IF;
          
          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
          VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'resource', v_listing.item_code, v_referral_commission_qty);
          
        ELSIF v_listing.listing_type = 'dark_matter' THEN
          UPDATE profiles
          SET dark_matter = COALESCE(dark_matter, 0) + v_referral_commission_qty
          WHERE id = v_referrer_id;
          
          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
          VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'dark_matter', 'dark_matter', v_referral_commission_qty);
          
        ELSIF v_listing.listing_type = 'ship' THEN
          SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_listing.item_code;
          
          IF v_ship_type_id IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM planet_ships WHERE planet_id = v_referrer_planet_id AND ship_type_id = v_ship_type_id) THEN
              UPDATE planet_ships
              SET quantity = quantity + v_referral_commission_qty
              WHERE planet_id = v_referrer_planet_id AND ship_type_id = v_ship_type_id;
            ELSE
              INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
              VALUES (v_referrer_planet_id, v_ship_type_id, v_referral_commission_qty);
            END IF;
            
            INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
            VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'ship', v_listing.item_code, v_referral_commission_qty);
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Compra realizada exitosamente',
    'total_paid', v_total_cost,
    'seller_received', v_seller_receives
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al procesar la compra: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION purchase_market_listing(uuid, uuid) TO authenticated;

-- Update get_referral_stats to show resource commissions properly
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_resource_commissions jsonb;
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;
  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;
  
  SELECT jsonb_build_object(
    'metal', COALESCE(SUM(CASE WHEN resource_type = 'metal' THEN amount ELSE 0 END), 0),
    'crystal', COALESCE(SUM(CASE WHEN resource_type = 'crystal' THEN amount ELSE 0 END), 0),
    'deuterium', COALESCE(SUM(CASE WHEN resource_type = 'deuterium' THEN amount ELSE 0 END), 0),
    'dark_matter', COALESCE(SUM(CASE WHEN resource_type = 'dark_matter' THEN amount ELSE 0 END), 0),
    'ships', COALESCE(SUM(CASE WHEN commission_type = 'ship' THEN amount ELSE 0 END), 0)
  ) INTO v_resource_commissions
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', rc.amount,
        'commission_type', rc.commission_type,
        'resource_type', rc.resource_type,
        'created_at', rc.created_at,
        'seller_username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_commissions', v_resource_commissions,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;
