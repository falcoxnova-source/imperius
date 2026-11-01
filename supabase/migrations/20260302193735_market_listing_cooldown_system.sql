/*
  # Market Listing Cooldown System

  1. New Settings
    - `market_listing_cooldown_minutes` in `game_settings` (default 5 minutes)
    - Controls how long a new listing must wait before it can be purchased

  2. Schema Changes
    - Add `purchasable_at` column to `market_listings` table
    - Defaults to `created_at + cooldown interval` via trigger

  3. Function Changes
    - `purchase_market_listing` now checks if `purchasable_at > now()` and blocks early purchases
    - New trigger function `set_market_listing_purchasable_at` sets `purchasable_at` on insert

  4. Security
    - No RLS changes needed
    - The cooldown is enforced server-side in the purchase function
    - The seller can still cancel during cooldown

  5. Important Notes
    - Existing active listings will have `purchasable_at = now()` so they remain purchasable immediately
    - The cooldown is configurable by admin via `game_settings`
    - Only affects sell listings (market_listings), not buy offers
*/

-- Add the game setting for cooldown minutes
INSERT INTO game_settings (key, value, description)
VALUES ('market_listing_cooldown_minutes', '5', 'Tiempo en minutos que una oferta de venta debe esperar antes de poder ser comprada')
ON CONFLICT (key) DO NOTHING;

-- Add purchasable_at column to market_listings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'market_listings' AND column_name = 'purchasable_at'
  ) THEN
    ALTER TABLE market_listings ADD COLUMN purchasable_at timestamptz;
  END IF;
END $$;

-- Set existing listings to be immediately purchasable
UPDATE market_listings
SET purchasable_at = created_at
WHERE purchasable_at IS NULL;

-- Make column NOT NULL with a default
ALTER TABLE market_listings ALTER COLUMN purchasable_at SET DEFAULT now();
ALTER TABLE market_listings ALTER COLUMN purchasable_at SET NOT NULL;

-- Create trigger function to set purchasable_at on insert
CREATE OR REPLACE FUNCTION set_market_listing_purchasable_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_cooldown_minutes integer;
BEGIN
  SELECT COALESCE(value::integer, 5) INTO v_cooldown_minutes
  FROM game_settings
  WHERE key = 'market_listing_cooldown_minutes';

  v_cooldown_minutes := COALESCE(v_cooldown_minutes, 5);

  NEW.purchasable_at := NEW.created_at + (v_cooldown_minutes || ' minutes')::interval;
  RETURN NEW;
END;
$fn$;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_set_market_listing_purchasable_at ON market_listings;
CREATE TRIGGER trg_set_market_listing_purchasable_at
  BEFORE INSERT ON market_listings
  FOR EACH ROW
  EXECUTE FUNCTION set_market_listing_purchasable_at();

-- Update purchase_market_listing to check cooldown
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
  v_jackpot_amount numeric;
  v_admin_fee numeric;
  v_referral_fee numeric;
  v_seller_amount numeric;
  v_ship_type_id integer;
  v_market_fee_percent numeric;
  v_referrer_id uuid;
  v_transaction_id uuid;
  v_seller_resources RECORD;
  v_seller_ship_qty integer;
  v_telegram_id bigint;
  v_is_member boolean;
  v_year_week text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

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

  SELECT * INTO v_listing
  FROM market_listings
  WHERE id = p_listing_id AND status = 'active'
  FOR UPDATE;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Listing not found or not active');
  END IF;

  -- Cooldown check: listing must be past its purchasable_at time
  IF v_listing.purchasable_at > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Esta oferta aun no esta disponible para compra. Espera a que termine el periodo de preparacion.',
      'cooldown_remaining', EXTRACT(EPOCH FROM (v_listing.purchasable_at - now()))::integer
    );
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
  v_seller_amount := v_total_price - v_fee;

  v_jackpot_amount := floor(v_fee * 50 / 100);

  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = v_listing.seller_id;

  IF v_referrer_id IS NOT NULL THEN
    v_referral_fee := floor(v_fee * 20 / 100);
    v_admin_fee := v_fee - v_jackpot_amount - v_referral_fee;
  ELSE
    v_referral_fee := 0;
    v_admin_fee := v_fee - v_jackpot_amount;
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_total_price WHERE id = v_user_id;
  UPDATE profiles SET fxu_balance = fxu_balance + v_seller_amount WHERE id = v_listing.seller_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_fee > 0 THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_admin_fee WHERE id = v_admin_id;

    PERFORM record_admin_revenue(
      'market_fee',
      v_admin_fee,
      'Venta: ' || v_purchase_qty || 'x ' || v_listing.item_code || ' (fee ' || v_market_fee_percent || '%, admin ' || round(v_admin_fee / v_fee * 100) || '%)',
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

  IF v_listing.listing_type = 'resource' THEN
    v_year_week := to_char(now(), 'IYYY-"W"IW');

    INSERT INTO market_monthly_sales (user_id, year_month, metal_sold, crystal_sold, deuterium_sold)
    VALUES (
      v_listing.seller_id,
      v_year_week,
      CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END
    )
    ON CONFLICT (user_id, year_month)
    DO UPDATE SET
      metal_sold = market_monthly_sales.metal_sold + CASE WHEN v_listing.item_code = 'metal' THEN v_purchase_qty ELSE 0 END,
      crystal_sold = market_monthly_sales.crystal_sold + CASE WHEN v_listing.item_code = 'crystal' THEN v_purchase_qty ELSE 0 END,
      deuterium_sold = market_monthly_sales.deuterium_sold + CASE WHEN v_listing.item_code = 'deuterium' THEN v_purchase_qty ELSE 0 END,
      updated_at = now();
  END IF;

  IF v_referrer_id IS NOT NULL AND v_referral_fee >= 1 THEN
    UPDATE profiles
    SET fxu_balance = COALESCE(fxu_balance, 0) + v_referral_fee
    WHERE id = v_referrer_id;

    INSERT INTO referral_commissions (referrer_id, seller_id, transaction_id, commission_type, resource_type, amount, fxu_amount)
    VALUES (v_referrer_id, v_listing.seller_id, v_transaction_id, 'market_referral', 'fxu', v_referral_fee, v_referral_fee);

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_referrer_id,
      v_listing.seller_id,
      'Comision de referido por venta en mercado',
      'Has recibido ' || ROUND(v_referral_fee, 2) || ' FXU como comision por la venta de tu referido en el mercado.',
      'system'
    );
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
