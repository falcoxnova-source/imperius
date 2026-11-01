-- =====================================================================
-- P2P FIX: p2p_expire_stale_offers reembolsaba fiat de ofertas BUY con
-- fiat EXTERNO (no FXU/USDT), acreditando usdt_balance de la nada.
-- Fecha: 2026-05-15
--
-- Bug:
--   En una oferta BUY, el creador (comprador) solo bloquea (escrow) fiat
--   cuando el fiat es interno (FXU/USDT). Con fiat externo NO se descuenta
--   nada en p2p_create_offer. Sin embargo, p2p_expire_stale_offers reembolsaba
--   available_amount * price de forma incondicional y, al no ser 'FXU',
--   caia al ELSE acreditando usdt_balance -> dinero gratis (exploit).
--
-- Fix:
--   Reembolsar fiat de ofertas BUY SOLO si el fiat es interno, igual que
--   p2p_cancel_offer, p2p_expire_order y p2p_admin_resolve_dispute.
--   Idempotente. Sin cambios de firma.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.p2p_expire_stale_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_offer p2p_offers%ROWTYPE;
  v_expired_count integer := 0;
  v_refund_fiat numeric;
  v_zero_available_count integer := 0;
  v_internal_fiat boolean;
BEGIN
  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  FOR v_offer IN
    SELECT *
    FROM p2p_offers
    WHERE status = 'active'
      AND expires_at <= now()
      AND available_amount > 0
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_offer.side = 'sell' THEN
      -- El vendedor recupera el activo libre que habia depositado en escrow.
      IF v_offer.asset = 'FXU' THEN
        UPDATE profiles
        SET fxu_balance = fxu_balance + v_offer.available_amount
        WHERE id = v_offer.user_id;
      ELSE
        UPDATE profiles
        SET usdt_balance = usdt_balance + v_offer.available_amount
        WHERE id = v_offer.user_id;
      END IF;
    ELSE
      -- BUY: solo se reembolsa fiat si fue bloqueado (fiat interno FXU/USDT).
      -- Con fiat externo el creador nunca deposito nada -> no reembolsar.
      v_internal_fiat := upper(coalesce(v_offer.fiat_currency, '')) IN ('FXU', 'USDT');
      IF v_internal_fiat THEN
        v_refund_fiat := round((v_offer.available_amount * v_offer.price_per_unit)::numeric, 8);
        IF v_refund_fiat > 0 THEN
          IF upper(v_offer.fiat_currency) = 'FXU' THEN
            UPDATE profiles
            SET fxu_balance = fxu_balance + v_refund_fiat
            WHERE id = v_offer.user_id;
          ELSE
            UPDATE profiles
            SET usdt_balance = usdt_balance + v_refund_fiat
            WHERE id = v_offer.user_id;
          END IF;
        END IF;
      END IF;
    END IF;

    UPDATE p2p_offers
    SET available_amount = 0,
        locked_amount = GREATEST(0, locked_amount - v_offer.available_amount),
        status = 'expired',
        updated_at = now()
    WHERE id = v_offer.id;

    INSERT INTO p2p_audit_log(offer_id, actor_id, action, meta)
    VALUES (
      v_offer.id,
      v_offer.user_id,
      'offer_expired',
      jsonb_build_object(
        'side', v_offer.side,
        'available_amount_refunded', v_offer.available_amount,
        'fiat_currency', v_offer.fiat_currency,
        'expired_at', now()
      )
    );

    v_expired_count := v_expired_count + 1;
  END LOOP;

  -- Ofertas vencidas sin saldo libre: solo sacarlas del libro.
  UPDATE p2p_offers
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND expires_at <= now()
    AND available_amount <= 0;

  GET DIAGNOSTICS v_zero_available_count = ROW_COUNT;
  v_expired_count := v_expired_count + v_zero_available_count;

  RETURN v_expired_count;
END;
$function$;
