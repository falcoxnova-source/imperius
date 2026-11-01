/*
  # Cancel All Active Buy Offers and Disable Buy Offer System

  1. Changes
    - Cancels ALL active buy offers (39 offers)
    - Refunds FXU to each buyer for their unfilled portions
    - Sends in-game message to each buyer notifying the refund
    - Replaces create_buy_offer function to block new offers
    - Replaces fulfill_buy_offer function to block fulfillment

  2. Important Notes
    - No data is deleted, offers are set to 'cancelled' status
    - FXU refunds are calculated as (quantity - quantity_filled) * price_per_unit
    - Existing completed/cancelled offers remain untouched
    - FXU protection trigger temporarily disabled for refund operation
*/

DO $$
DECLARE
  v_offer RECORD;
  v_refund numeric;
BEGIN
  ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger;

  FOR v_offer IN
    SELECT id, buyer_id, quantity, quantity_filled, price_per_unit, item_code, listing_type
    FROM market_buy_offers
    WHERE status = 'active'
    FOR UPDATE
  LOOP
    v_refund := (v_offer.quantity - v_offer.quantity_filled) * v_offer.price_per_unit;

    IF v_refund > 0 THEN
      UPDATE profiles
      SET fxu_balance = fxu_balance + v_refund
      WHERE id = v_offer.buyer_id;
    END IF;

    UPDATE market_buy_offers
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_offer.id;

    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL,
      v_offer.buyer_id,
      'Oferta de compra cancelada',
      'Tu oferta de compra de ' || v_offer.item_code || ' ha sido cancelada por mantenimiento del sistema. Se te han devuelto ' || v_refund || ' FXU.',
      'system'
    );
  END LOOP;

  ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger;
END $$;

DROP FUNCTION IF EXISTS create_buy_offer(text, text, bigint, numeric);

CREATE FUNCTION create_buy_offer(
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
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'El sistema de ofertas de compra esta temporalmente deshabilitado. Proximamente estara disponible.'
  );
END;
$$;

DROP FUNCTION IF EXISTS fulfill_buy_offer(uuid, bigint, uuid);

CREATE FUNCTION fulfill_buy_offer(
  p_offer_id uuid,
  p_quantity bigint,
  p_planet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'success', false,
    'error', 'El sistema de ofertas de compra esta temporalmente deshabilitado. Proximamente estara disponible.'
  );
END;
$$;
