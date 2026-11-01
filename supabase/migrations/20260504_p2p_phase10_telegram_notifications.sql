-- =====================================================================
-- P2P Fase 10 — Notificación a Telegram al crear oferta
-- =====================================================================
-- 1) Tabla p2p_notification_config (toggle + url + anon_key).
-- 2) Función send_p2p_offer_telegram_notification(offer_id): invoca la
--    edge function `notify-p2p-offer` vía pg_net.
-- 3) Trigger AFTER INSERT en p2p_offers (solo ofertas 'active').
--    Best-effort: nunca bloquea la creación de la oferta.
-- =====================================================================

-- 1) Config table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_notification_config (
  id                int PRIMARY KEY DEFAULT 1,
  edge_function_url text NOT NULL,
  anon_key          text NOT NULL,
  is_enabled        boolean NOT NULL DEFAULT true,
  min_amount_fxu_eq numeric NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT p2p_notification_config_singleton CHECK (id = 1)
);

-- Pre-seed con la URL del proyecto + el anon_key ya existente en market_notification_config
INSERT INTO p2p_notification_config (id, edge_function_url, anon_key, is_enabled, min_amount_fxu_eq)
SELECT 1,
       replace(edge_function_url, 'notify-market-listing', 'notify-p2p-offer'),
       anon_key,
       true,
       0
FROM market_notification_config WHERE id = 1
ON CONFLICT (id) DO NOTHING;

-- Solo admins pueden tocar la config
ALTER TABLE p2p_notification_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p2p_notif_cfg_admin ON p2p_notification_config;
CREATE POLICY p2p_notif_cfg_admin ON p2p_notification_config
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- 2) Función que dispara la notificación -------------------------------
CREATE OR REPLACE FUNCTION send_p2p_offer_telegram_notification(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg       p2p_notification_config%ROWTYPE;
  v_offer     p2p_offers%ROWTYPE;
  v_username  text;
  v_methods   text[];
  v_amount_fxu_eq numeric;
  v_payload   jsonb;
  v_req_id    bigint;
BEGIN
  SELECT * INTO v_cfg FROM p2p_notification_config WHERE id = 1;
  IF v_cfg IS NULL OR NOT v_cfg.is_enabled OR coalesce(v_cfg.edge_function_url,'') = '' THEN
    RETURN;
  END IF;

  SELECT * INTO v_offer FROM p2p_offers WHERE id = p_offer_id;
  IF NOT FOUND OR v_offer.status <> 'active' THEN
    RETURN;
  END IF;

  -- Umbral mínimo (FXU-eq) para evitar spam con ofertas minúsculas
  v_amount_fxu_eq := CASE WHEN v_offer.asset = 'FXU'
                          THEN v_offer.available_amount
                          ELSE v_offer.available_amount * 10000
                     END;
  IF v_amount_fxu_eq < v_cfg.min_amount_fxu_eq THEN
    RETURN;
  END IF;

  SELECT username INTO v_username FROM profiles WHERE id = v_offer.user_id;

  SELECT COALESCE(array_agg(pm.name), '{}')
    INTO v_methods
    FROM unnest(v_offer.payment_method_ids) AS oid
    JOIN p2p_payment_methods pm ON pm.id = oid;

  v_payload := jsonb_build_object(
    'offer_id',         v_offer.id,
    'seller_username',  COALESCE(v_username, 'Trader'),
    'side',             v_offer.side,
    'asset',            v_offer.asset,
    'fiat_currency',    v_offer.fiat_currency,
    'price_per_unit',   v_offer.price_per_unit,
    'available_amount', v_offer.available_amount,
    'min_trade_amount', v_offer.min_trade_amount,
    'max_trade_amount', v_offer.max_trade_amount,
    'payment_methods',  v_methods
  );

  BEGIN
    SELECT net.http_post(
      url := v_cfg.edge_function_url,
      body := v_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey',       v_cfg.anon_key,
        'Authorization','Bearer ' || v_cfg.anon_key
      )
    ) INTO v_req_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P2P Telegram notification error: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION send_p2p_offer_telegram_notification(uuid) TO authenticated;

-- 3) Trigger AFTER INSERT en p2p_offers --------------------------------
CREATE OR REPLACE FUNCTION p2p_offer_after_insert_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    -- best-effort: nunca bloquea el INSERT
    BEGIN
      PERFORM send_p2p_offer_telegram_notification(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'p2p_offer_after_insert_notify: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p2p_offer_notify ON p2p_offers;
CREATE TRIGGER trg_p2p_offer_notify
  AFTER INSERT ON p2p_offers
  FOR EACH ROW EXECUTE FUNCTION p2p_offer_after_insert_notify();

COMMENT ON FUNCTION send_p2p_offer_telegram_notification(uuid) IS
'Fase 10: envía la oferta P2P a Telegram vía edge function notify-p2p-offer.';
