/*
  # Referral Commission System for Market Sales

  1. Overview
    - Referrers earn 5% commission on market sales made by their referrals
    - Commission is generated (not taken from the seller)
    - Commission is paid in the same resource type as the sale
    - No limit on referrals, permanent referral link

  2. New Columns
    - `profiles.referred_by` (uuid) - References the user who referred this player
    - `profiles.referral_code` (text) - Unique code for sharing referral link

  3. New Tables
    - `referral_commissions` - Tracks all commission earnings
      - `id` (uuid, primary key)
      - `referrer_id` (uuid) - Who earned the commission
      - `seller_id` (uuid) - The referred user who made the sale
      - `transaction_id` (uuid) - The market transaction that triggered this
      - `commission_type` (text) - Type of commission (resource, ship, dark_matter)
      - `resource_type` (text) - Specific resource type (metal, crystal, deuterium, or ship code)
      - `amount` (bigint) - Amount of commission earned
      - `created_at` (timestamptz)

  4. Function Updates
    - `purchase_market_listing` - Now pays 5% commission to referrer
    - `set_referral` - Allows setting referral code on registration

  5. Security
    - RLS enabled on referral_commissions
    - Users can only view their own commissions
*/

-- Add referral columns to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'referred_by'
  ) THEN
    ALTER TABLE profiles ADD COLUMN referred_by uuid REFERENCES profiles(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE profiles ADD COLUMN referral_code text UNIQUE;
  END IF;
END $$;

-- Generate referral codes for existing users
UPDATE profiles
SET referral_code = UPPER(SUBSTRING(id::text, 1, 8))
WHERE referral_code IS NULL;

-- Create referral commissions tracking table
CREATE TABLE IF NOT EXISTS referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id),
  seller_id uuid NOT NULL REFERENCES profiles(id),
  transaction_id uuid REFERENCES market_transactions(id),
  commission_type text NOT NULL,
  resource_type text,
  amount bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_seller ON referral_commissions(seller_id);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

-- Enable RLS
ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;

-- RLS policies for referral_commissions
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own commissions earned" ON referral_commissions;
  DROP POLICY IF EXISTS "Users can view commissions they generated" ON referral_commissions;
END $$;

CREATE POLICY "Users can view own commissions earned"
  ON referral_commissions FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id);

CREATE POLICY "Users can view commissions they generated"
  ON referral_commissions FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

-- Function to set referral on registration
CREATE OR REPLACE FUNCTION set_user_referral(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referrer_id uuid;
  v_current_referrer uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Check if user already has a referrer
  SELECT referred_by INTO v_current_referrer FROM profiles WHERE id = v_user_id;
  
  IF v_current_referrer IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya tienes un referidor asignado');
  END IF;

  -- Find referrer by code
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = UPPER(p_referral_code);
  
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Codigo de referido no encontrado');
  END IF;

  -- Cannot refer yourself
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes referirte a ti mismo');
  END IF;

  -- Set the referral
  UPDATE profiles SET referred_by = v_referrer_id WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Referido asignado correctamente');
END;
$$;

GRANT EXECUTE ON FUNCTION set_user_referral(text) TO authenticated;

-- Updated purchase_market_listing with referral commission
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
  v_seller_receives numeric;
  v_ship_type_id int;
  v_existing_ship record;
  v_market_fee_percent numeric := 10;
  v_referrer_id uuid;
  v_referrer_planet_id uuid;
  v_commission_amount bigint;
  v_commission_percent numeric := 5;
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
  
  -- REFERRAL COMMISSION SYSTEM
  -- Check if seller has a referrer
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;
  
  IF v_referrer_id IS NOT NULL THEN
    -- Get referrer's main planet (first planet)
    SELECT id INTO v_referrer_planet_id 
    FROM planets 
    WHERE user_id = v_referrer_id 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    IF v_referrer_planet_id IS NOT NULL THEN
      -- Calculate 5% commission
      v_commission_amount := FLOOR(v_listing.quantity * v_commission_percent / 100);
      
      -- Only pay if commission is at least 1
      IF v_commission_amount >= 1 THEN
        -- Pay commission in the same resource type
        IF v_listing.listing_type = 'resource' THEN
          IF v_listing.item_code = 'metal' THEN
            UPDATE planet_resources SET metal = metal + v_commission_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'crystal' THEN
            UPDATE planet_resources SET crystal = crystal + v_commission_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_listing.item_code = 'deuterium' THEN
            UPDATE planet_resources SET deuterium = deuterium + v_commission_amount WHERE planet_id = v_referrer_planet_id;
          END IF;
          
          -- Record the commission
          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
          VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'resource', v_listing.item_code, v_commission_amount);
          
        ELSIF v_listing.listing_type = 'dark_matter' THEN
          -- Pay dark matter commission
          UPDATE profiles
          SET dark_matter = COALESCE(dark_matter, 0) + v_commission_amount
          WHERE id = v_referrer_id;
          
          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
          VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'dark_matter', 'dark_matter', v_commission_amount);
          
        ELSIF v_listing.listing_type = 'ship' THEN
          -- For ships, pay commission in metal equivalent (ship metal cost * quantity * 5%)
          -- We'll just give metal for ships to keep it simple
          v_commission_amount := FLOOR(v_listing.quantity * 1000 * v_commission_percent / 100);
          IF v_commission_amount >= 1 THEN
            UPDATE planet_resources SET metal = metal + v_commission_amount WHERE planet_id = v_referrer_planet_id;
            
            INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount)
            VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'ship', 'metal', v_commission_amount);
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

-- Function to get referral stats
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
  v_total_commissions jsonb;
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
    'dark_matter', COALESCE(SUM(CASE WHEN resource_type = 'dark_matter' THEN amount ELSE 0 END), 0)
  ) INTO v_total_commissions
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_commissions', v_total_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;
