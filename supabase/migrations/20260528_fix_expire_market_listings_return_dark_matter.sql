CREATE OR REPLACE FUNCTION expire_old_market_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing RECORD;
  v_count integer := 0;
BEGIN
  FOR v_listing IN
    SELECT id, seller_id, item_code, quantity, listing_type
    FROM market_listings
    WHERE status = 'active'
      AND created_at < NOW() - INTERVAL '24 hours'
  LOOP
    UPDATE market_listings
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_listing.id;

    IF v_listing.listing_type = 'dark_matter' THEN
      UPDATE profiles
      SET dark_matter = COALESCE(dark_matter, 0) + v_listing.quantity
      WHERE id = v_listing.seller_id;
    END IF;

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_listing.seller_id,
      v_listing.seller_id,
      'Oferta expirada (24h)',
      'Tu oferta de ' || v_listing.quantity || ' ' || v_listing.item_code || ' ha expirado tras 24 horas en el mercado.',
      'system'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
