/*
  # Buy Offers System

  ## Summary
  Adds a "buy offers" system to the market where buyers can post offers requesting
  resources/ships/dark_matter at a specific price. Sellers can then fulfill these
  offers by delivering the items.

  ## Flow
  1. Buyer creates a buy offer specifying item, quantity, and price per unit
  2. FXU is locked (deducted) from buyer immediately
  3. A seller fulfills the offer by delivering items from their planet
  4. Seller receives FXU minus market fee (same fee structure as sell listings)
  5. Buyer can cancel unfulfilled offers to get FXU refunded

  ## Fee Structure (identical to sell listings)
  - Market fee % applied to total FXU price
  - Fee split: jackpot_contribution_rate% to jackpot, remainder to admin
  - Referral commission on seller (same as sell listings)

  ## New Tables
  - `market_buy_offers`
    - `id` (uuid, primary key)
    - `buyer_id` (uuid, references profiles)
    - `listing_type` (text: resource, ship, dark_matter)
    - `item_code` (text)
    - `quantity` (bigint, total requested)
    - `quantity_filled` (bigint, how much has been fulfilled)
    - `price_per_unit` (numeric)
    - `total_price` (numeric)
    - `status` (text: active, filled, cancelled)
    - `created_at`, `updated_at`

  ## New Functions
  - `create_buy_offer(...)` - Buyer creates offer, FXU locked
  - `fulfill_buy_offer(...)` - Seller fulfills offer, delivers items, receives FXU
  - `cancel_buy_offer(...)` - Buyer cancels, unfilled FXU refunded

  ## Security
  - RLS enabled on market_buy_offers
  - All functions are SECURITY DEFINER
  - Telegram requirement enforced
*/

-- 1. Create market_buy_offers table
CREATE TABLE IF NOT EXISTS market_buy_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('resource', 'ship', 'dark_matter')),
  item_code text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  quantity_filled bigint NOT NULL DEFAULT 0,
  price_per_unit numeric NOT NULL CHECK (price_per_unit > 0),
  total_price numeric NOT NULL CHECK (total_price > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'filled', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE market_buy_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active buy offers"
  ON market_buy_offers
  FOR SELECT
  TO authenticated
  USING (status = 'active' OR buyer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_buy_offers_status ON market_buy_offers(status);
CREATE INDEX IF NOT EXISTS idx_buy_offers_buyer ON market_buy_offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_buy_offers_item ON market_buy_offers(listing_type, item_code, status);

-- 2. Create buy offer function
CREATE OR REPLACE FUNCTION create_buy_offer(
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_total_price numeric;
  v_buyer_fxu numeric;
  v_offer_id uuid;
  v_telegram_id bigint;
  v_is_member boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;

  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.',
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

  IF p_listing_type = 'resource' THEN
    IF p_item_code NOT IN ('metal', 'crystal', 'deuterium') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurso invalido');
    END IF;
  ELSIF p_listing_type = 'ship' THEN
    IF NOT EXISTS (SELECT 1 FROM ship_types WHERE code = p_item_code) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave invalido');
    END IF;
  ELSIF p_listing_type = 'dark_matter' THEN
    IF p_item_code != 'dark_matter' THEN
      p_item_code := 'dark_matter';
    END IF;
  END IF;

  v_total_price := p_quantity * p_price_per_unit;

  IF v_total_price > 1000000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Precio total excede el maximo');
  END IF;

  SELECT fxu_balance INTO v_buyer_fxu
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF v_buyer_fxu IS NULL OR v_buyer_fxu < v_total_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance FXU insuficiente. Necesitas ' || v_total_price || ' FXU');
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;

  INSERT INTO market_buy_offers (buyer_id, listing_type, item_code, quantity, quantity_filled, price_per_unit, total_price, status)
  VALUES (v_user_id, p_listing_type, p_item_code, p_quantity, 0, p_price_per_unit, v_total_price, 'active')
  RETURNING id INTO v_offer_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta de compra creada. Se han bloqueado ' || v_total_price || ' FXU.',
    'offer_id', v_offer_id,
    'total_locked', v_total_price
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al crear oferta: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_buy_offer(text, text, bigint, numeric) TO authenticated;

-- 3. Fulfill buy offer function (seller delivers items)
CREATE OR REPLACE FUNCTION fulfill_buy_offer(
  p_offer_id uuid,
  p_quantity integer,
  p_planet_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer RECORD;
  v_fill_qty bigint;
  v_fill_price numeric;
  v_fee numeric;
  v_jackpot_contribution_rate numeric;
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_seller_amount numeric;
  v_admin_id uuid;
  v_market_fee_percent numeric;
  v_ship_type_id integer;
  v_seller_ship_qty integer;
  v_seller_resources RECORD;
  v_seller_dm integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_referrer_id uuid;
  v_referral_commission_percent numeric;
  v_referral_commission numeric;
  v_referral_resource_amount bigint;
  v_referrer_planet_id uuid;
  v_transaction_id uuid;
  v_vacation boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT telegram_id INTO v_telegram_id
  FROM telegram_links
  WHERE user_id = v_user_id;

  IF v_telegram_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes vincular tu cuenta de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT is_member INTO v_is_member
  FROM telegram_task_rewards
  WHERE user_id = v_user_id AND task_type = 'join_group';

  IF v_is_member IS NULL OR v_is_member = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Debes ser miembro del grupo de Telegram para usar el mercado.',
      'requires_telegram', true
    );
  END IF;

  SELECT vacation_mode INTO v_vacation FROM profiles WHERE id = v_user_id;
  IF COALESCE(v_vacation, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes operar en el mercado en modo vacaciones');
  END IF;

  v_market_fee_percent := get_market_fee_percent();
  v_referral_commission_percent := get_referral_commission_percent();

  SELECT contribution_rate INTO v_jackpot_contribution_rate FROM jackpot_config WHERE id = 1;
  v_jackpot_contribution_rate := COALESCE(v_jackpot_contribution_rate, 10);

  SELECT * INTO v_offer
  FROM market_buy_offers
  WHERE id = p_offer_id AND status = 'active'
  FOR UPDATE;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada o no esta activa');
  END IF;

  IF v_offer.buyer_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes cumplir tu propia oferta');
  END IF;

  v_fill_qty := LEAST(p_quantity, v_offer.quantity - v_offer.quantity_filled);
  IF v_fill_qty < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cantidad invalida');
  END IF;

  IF v_offer.listing_type != 'dark_matter' THEN
    IF p_planet_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Planeta requerido');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id AND user_id = v_user_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'No eres dueno de este planeta');
    END IF;
  END IF;

  IF v_offer.listing_type = 'resource' THEN
    SELECT metal, crystal, deuterium INTO v_seller_resources
    FROM planet_resources
    WHERE planet_id = p_planet_id
    FOR UPDATE;

    IF v_offer.item_code = 'metal' AND (v_seller_resources.metal IS NULL OR v_seller_resources.metal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Metal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'crystal' AND (v_seller_resources.crystal IS NULL OR v_seller_resources.crystal < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cristal insuficiente en tu planeta');
    ELSIF v_offer.item_code = 'deuterium' AND (v_seller_resources.deuterium IS NULL OR v_seller_resources.deuterium < v_fill_qty) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Deuterio insuficiente en tu planeta');
    END IF;

    IF v_offer.item_code = 'metal' THEN
      UPDATE planet_resources SET metal = metal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'crystal' THEN
      UPDATE planet_resources SET crystal = crystal - v_fill_qty WHERE planet_id = p_planet_id;
    ELSIF v_offer.item_code = 'deuterium' THEN
      UPDATE planet_resources SET deuterium = deuterium - v_fill_qty WHERE planet_id = p_planet_id;
    END IF;

  ELSIF v_offer.listing_type = 'ship' THEN
    SELECT id INTO v_ship_type_id FROM ship_types WHERE code = v_offer.item_code;
    IF v_ship_type_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Tipo de nave no encontrado');
    END IF;

    SELECT quantity INTO v_seller_ship_qty
    FROM planet_ships
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id
    FOR UPDATE;

    IF v_seller_ship_qty IS NULL OR v_seller_ship_qty < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Naves insuficientes en tu planeta');
    END IF;

    UPDATE planet_ships
    SET quantity = quantity - v_fill_qty
    WHERE planet_id = p_planet_id AND ship_type_id = v_ship_type_id;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    SELECT dark_matter INTO v_seller_dm FROM profiles WHERE id = v_user_id FOR UPDATE;
    IF v_seller_dm IS NULL OR v_seller_dm < v_fill_qty THEN
      RETURN jsonb_build_object('success', false, 'error', 'Materia oscura insuficiente');
    END IF;

    UPDATE profiles SET dark_matter = dark_matter - v_fill_qty WHERE id = v_user_id;
  END IF;

  v_fill_price := v_offer.price_per_unit * v_fill_qty;

  v_fee := v_fill_price * (v_market_fee_percent / 100);
  v_jackpot_amount := floor(v_fee * (v_jackpot_contribution_rate / 100));
  v_admin_fee := v_fee - v_jackpot_amount;
  v_seller_amount := v_fill_price - v_fee;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Oferta compra: ' || v_fill_qty || 'x ' || v_offer.item_code || ' (' || v_market_fee_percent || '% fee)',
      v_user_id,
      p_offer_id
    );
  END IF;

  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot(v_jackpot_amount, 'market_fee', v_user_id);
  END IF;

  -- Deliver items to buyer
  IF v_offer.listing_type = 'ship' THEN
    DECLARE
      v_buyer_planet_id uuid;
    BEGIN
      SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_offer.buyer_id AND is_main_planet = true LIMIT 1;
      IF v_buyer_planet_id IS NOT NULL THEN
        INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
        VALUES (v_buyer_planet_id, v_ship_type_id, v_fill_qty)
        ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = planet_ships.quantity + v_fill_qty;
      END IF;
    END;

  ELSIF v_offer.listing_type = 'resource' THEN
    DECLARE
      v_buyer_planet_id uuid;
    BEGIN
      SELECT id INTO v_buyer_planet_id FROM planets WHERE user_id = v_offer.buyer_id AND is_main_planet = true LIMIT 1;
      IF v_buyer_planet_id IS NOT NULL THEN
        IF v_offer.item_code = 'metal' THEN
          UPDATE planet_resources SET metal = metal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
        ELSIF v_offer.item_code = 'crystal' THEN
          UPDATE planet_resources SET crystal = crystal + v_fill_qty WHERE planet_id = v_buyer_planet_id;
        ELSIF v_offer.item_code = 'deuterium' THEN
          UPDATE planet_resources SET deuterium = deuterium + v_fill_qty WHERE planet_id = v_buyer_planet_id;
        END IF;
      END IF;
    END;

  ELSIF v_offer.listing_type = 'dark_matter' THEN
    UPDATE profiles SET dark_matter = COALESCE(dark_matter, 0) + v_fill_qty WHERE id = v_offer.buyer_id;
  END IF;

  INSERT INTO market_transactions (listing_id, buyer_id, seller_id, item_type, item_code, quantity, total_price)
  VALUES (p_offer_id, v_offer.buyer_id, v_user_id, v_offer.listing_type, v_offer.item_code, v_fill_qty, v_fill_price)
  RETURNING id INTO v_transaction_id;

  -- Referral commission (same as sell listings - based on seller's referrer)
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_user_id;

  IF v_referrer_id IS NOT NULL AND v_referral_commission_percent > 0 THEN
    IF v_offer.listing_type = 'resource' THEN
      v_referral_resource_amount := FLOOR(v_fill_qty * v_referral_commission_percent / 100);

      IF v_referral_resource_amount >= 1 THEN
        SELECT id INTO v_referrer_planet_id
        FROM planets
        WHERE user_id = v_referrer_id AND is_main_planet = true
        LIMIT 1;

        IF v_referrer_planet_id IS NOT NULL THEN
          IF v_offer.item_code = 'metal' THEN
            UPDATE planet_resources SET metal = metal + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_offer.item_code = 'crystal' THEN
            UPDATE planet_resources SET crystal = crystal + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          ELSIF v_offer.item_code = 'deuterium' THEN
            UPDATE planet_resources SET deuterium = deuterium + v_referral_resource_amount WHERE planet_id = v_referrer_planet_id;
          END IF;

          INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
          VALUES (v_referrer_id, v_user_id, v_transaction_id, 'resource', v_offer.item_code, v_referral_resource_amount, 0);
        END IF;
      END IF;

    ELSE
      v_referral_commission := FLOOR(v_fill_price * v_referral_commission_percent / 100);

      IF v_referral_commission >= 1 THEN
        UPDATE profiles
        SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_commission
        WHERE id = v_referrer_id;

        INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
        VALUES (v_referrer_id, v_user_id, v_transaction_id, 'fxu', 'fxu', v_referral_commission, v_referral_commission);
      END IF;
    END IF;
  END IF;

  -- Update offer fill status
  UPDATE market_buy_offers
  SET
    quantity_filled = quantity_filled + v_fill_qty,
    status = CASE WHEN quantity_filled + v_fill_qty >= quantity THEN 'filled' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_offer_id;

  -- Notify buyer
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    v_user_id,
    v_offer.buyer_id,
    'Oferta de compra cumplida',
    'Tu oferta de compra de ' || v_fill_qty || 'x ' || v_offer.item_code || ' ha sido cumplida. Los items fueron enviados a tu planeta principal.',
    'system'
  );

  RETURN jsonb_build_object(
    'success', true,
    'quantity_filled', v_fill_qty,
    'fxu_received', v_seller_amount,
    'fee_paid', v_fee,
    'jackpot_contribution', v_jackpot_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cumplir oferta: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION fulfill_buy_offer(uuid, integer, uuid) TO authenticated;

-- 4. Cancel buy offer function
CREATE OR REPLACE FUNCTION cancel_buy_offer(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_offer RECORD;
  v_refund numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_offer
  FROM market_buy_offers
  WHERE id = p_offer_id AND buyer_id = v_user_id AND status = 'active'
  FOR UPDATE;

  IF v_offer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oferta no encontrada o no puedes cancelarla');
  END IF;

  v_refund := (v_offer.quantity - v_offer.quantity_filled) * v_offer.price_per_unit;

  IF v_refund > 0 THEN
    PERFORM _internal_set_fxu_context();
    UPDATE profiles SET fxu_balance = fxu_balance + v_refund WHERE id = v_user_id;
  END IF;

  UPDATE market_buy_offers
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_offer_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Oferta cancelada. Se devolvieron ' || v_refund || ' FXU.',
    'refund', v_refund
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Error al cancelar: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_buy_offer(uuid) TO authenticated;