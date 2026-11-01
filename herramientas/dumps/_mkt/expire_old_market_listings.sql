CREATE OR REPLACE FUNCTION public.expire_old_market_listings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec   RECORD;
  v_count integer := 0;
BEGIN
  FOR v_rec IN
    UPDATE market_listings ml
    SET status = 'cancelled', updated_at = now()
    WHERE ml.id IN (
      SELECT id
      FROM market_listings
      WHERE status = 'active'
        AND created_at < now() - INTERVAL '24 hours'
      ORDER BY created_at
      LIMIT 500
      FOR UPDATE SKIP LOCKED
    )
    RETURNING ml.id, ml.seller_id, ml.item_code, ml.quantity, ml.listing_type
  LOOP
    -- La materia oscura era el unico recurso retenido; se devuelve igual
    -- que en cancel_market_listing. Los planos los devuelve el trigger
    -- trg_return_blueprint_on_listing_cancel (ya es idempotente).
    IF v_rec.listing_type = 'dark_matter' THEN
      UPDATE profiles
      SET dark_matter = COALESCE(dark_matter, 0) + v_rec.quantity
      WHERE id = v_rec.seller_id;
    END IF;

    INSERT INTO messages (recipient_id, sender_id, subject, body, message_type)
    VALUES (
      v_rec.seller_id,
      v_rec.seller_id,
      'Oferta de venta expirada (24h)',
      'Tu oferta de venta de ' || v_rec.quantity || ' x ' || v_rec.item_code ||
      ' ha expirado tras 24 horas en el mercado y fue cancelada automaticamente.',
      'system'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$

