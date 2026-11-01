-- =====================================================================
-- P2P Marketplace - Fase 1 (FXU/USDT interno) + base para Fase 2 (fiat global)
-- Módulo AISLADO: tablas con prefijo p2p_*, NO modifica tablas del juego.
-- Único punto de contacto: profiles.fxu_balance / profiles.usdt_balance
-- vía funciones atómicas con SELECT ... FOR UPDATE.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo de métodos de pago
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_payment_methods (
  id               serial PRIMARY KEY,
  code             text UNIQUE NOT NULL,           -- 'internal_fxu', 'internal_usdt', 'cup_transfer', 'mlc', 'saldomovil', ...
  name             text NOT NULL,                  -- 'FXU interno', 'Transferencia CUP', ...
  country_code     text,                           -- ISO 3166 alpha-2 ('CU','VE','ES'...), NULL = global
  currency_code    text NOT NULL,                  -- 'FXU','USDT','CUP','MLC','USD','EUR','VES',...
  method_type      text NOT NULL CHECK (method_type IN ('internal','bank_transfer','mobile','crypto','cash','voucher','other')),
  requires_account boolean NOT NULL DEFAULT true,  -- si hay que registrar datos (cuenta, teléfono, etc.)
  is_enabled       boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 100,
  icon             text,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_payment_methods_country ON p2p_payment_methods(country_code, currency_code) WHERE is_enabled = true;

-- ---------------------------------------------------------------------
-- 2) Métodos de pago registrados por cada usuario
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_user_payment_methods (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_method_id integer NOT NULL REFERENCES p2p_payment_methods(id),
  holder_name       text,
  account_data      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"number":"...","bank":"..."} (cifrado a futuro)
  is_verified       boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_user_pm ON p2p_user_payment_methods(user_id, is_active);

-- ---------------------------------------------------------------------
-- 3) Ofertas publicadas (libro de órdenes)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_offers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  side               text NOT NULL CHECK (side IN ('sell','buy')),       -- vendedor o comprador del activo
  asset              text NOT NULL CHECK (asset IN ('FXU','USDT')),      -- activo que se vende/compra en el juego
  fiat_currency      text NOT NULL,                                      -- moneda que se paga/recibe ('USDT','FXU','CUP','MLC','USD','EUR','VES',...)
  price_per_unit     numeric(24,8) NOT NULL CHECK (price_per_unit > 0),  -- precio en fiat_currency por 1 unidad de asset
  total_amount       numeric(24,8) NOT NULL CHECK (total_amount > 0),    -- total de asset publicado
  available_amount   numeric(24,8) NOT NULL CHECK (available_amount >= 0),
  locked_amount      numeric(24,8) NOT NULL DEFAULT 0 CHECK (locked_amount >= 0),
  min_trade_amount   numeric(24,8) NOT NULL DEFAULT 0,
  max_trade_amount   numeric(24,8),
  payment_method_ids integer[] NOT NULL DEFAULT '{}',                    -- métodos aceptados
  country_code       text,
  terms              text,
  time_limit_minutes integer NOT NULL DEFAULT 30 CHECK (time_limit_minutes BETWEEN 5 AND 180),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  updated_at         timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_offers_book ON p2p_offers(asset, fiat_currency, side, status, price_per_unit);
CREATE INDEX IF NOT EXISTS idx_p2p_offers_user ON p2p_offers(user_id, status);

-- ---------------------------------------------------------------------
-- 4) Órdenes (una operación entre dos usuarios)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id              uuid NOT NULL REFERENCES p2p_offers(id),
  seller_id             uuid NOT NULL REFERENCES profiles(id),
  buyer_id              uuid NOT NULL REFERENCES profiles(id),
  asset                 text NOT NULL CHECK (asset IN ('FXU','USDT')),
  asset_amount          numeric(24,8) NOT NULL CHECK (asset_amount > 0),
  fiat_currency         text NOT NULL,
  fiat_amount           numeric(24,8) NOT NULL CHECK (fiat_amount > 0),
  price_per_unit        numeric(24,8) NOT NULL,
  payment_method_id     integer NOT NULL REFERENCES p2p_payment_methods(id),
  buyer_payment_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fee_asset             numeric(24,8) NOT NULL DEFAULT 0,
  fee_percent           numeric(6,4)  NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending_payment'
                         CHECK (status IN ('pending_payment','paid','released','cancelled','expired','disputed','resolved')),
  payment_deadline      timestamptz NOT NULL,
  paid_at               timestamptz,
  released_at           timestamptz,
  cancelled_at          timestamptz,
  cancellation_reason   text,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_seller ON p2p_orders(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_buyer  ON p2p_orders(buyer_id,  status);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_deadline ON p2p_orders(status, payment_deadline) WHERE status = 'pending_payment';

-- ---------------------------------------------------------------------
-- 5) Chat por orden
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES profiles(id),
  body       text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  attachment_url text,
  is_system  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_messages_order ON p2p_messages(order_id, created_at);

-- ---------------------------------------------------------------------
-- 6) Disputas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_disputes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL UNIQUE REFERENCES p2p_orders(id),
  opened_by      uuid NOT NULL REFERENCES profiles(id),
  reason         text NOT NULL,
  evidence       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved_buyer','resolved_seller','cancelled')),
  admin_id       uuid REFERENCES profiles(id),
  admin_notes    text,
  opened_at      timestamptz NOT NULL DEFAULT NOW(),
  resolved_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_p2p_disputes_status ON p2p_disputes(status);

-- ---------------------------------------------------------------------
-- 7) Reputación
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_reputation (
  user_id              uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_orders         integer NOT NULL DEFAULT 0,
  completed_orders     integer NOT NULL DEFAULT 0,
  cancelled_orders     integer NOT NULL DEFAULT 0,
  disputed_orders      integer NOT NULL DEFAULT 0,
  lost_disputes        integer NOT NULL DEFAULT 0,
  avg_release_seconds  integer NOT NULL DEFAULT 0,
  rating_sum           integer NOT NULL DEFAULT 0,
  rating_count         integer NOT NULL DEFAULT 0,
  is_banned            boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 8) Log de auditoría
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS p2p_audit_log (
  id         bigserial PRIMARY KEY,
  order_id   uuid REFERENCES p2p_orders(id),
  offer_id   uuid REFERENCES p2p_offers(id),
  actor_id   uuid REFERENCES profiles(id),
  action     text NOT NULL,
  meta       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_audit_order ON p2p_audit_log(order_id);

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE p2p_payment_methods       ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_user_payment_methods  ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_offers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_disputes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_reputation            ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_audit_log             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p2p_pm_select ON p2p_payment_methods;
CREATE POLICY p2p_pm_select ON p2p_payment_methods FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p2p_upm_own ON p2p_user_payment_methods;
CREATE POLICY p2p_upm_own ON p2p_user_payment_methods FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p2p_offers_read ON p2p_offers;
CREATE POLICY p2p_offers_read ON p2p_offers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS p2p_offers_write ON p2p_offers;
CREATE POLICY p2p_offers_write ON p2p_offers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p2p_orders_read ON p2p_orders;
CREATE POLICY p2p_orders_read ON p2p_orders FOR SELECT TO authenticated
  USING (seller_id = auth.uid() OR buyer_id = auth.uid());

DROP POLICY IF EXISTS p2p_msgs_read ON p2p_messages;
CREATE POLICY p2p_msgs_read ON p2p_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM p2p_orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid())));

DROP POLICY IF EXISTS p2p_msgs_insert ON p2p_messages;
CREATE POLICY p2p_msgs_insert ON p2p_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid()
              AND EXISTS (SELECT 1 FROM p2p_orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid())));

DROP POLICY IF EXISTS p2p_disputes_read ON p2p_disputes;
CREATE POLICY p2p_disputes_read ON p2p_disputes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM p2p_orders o WHERE o.id = order_id AND (o.seller_id = auth.uid() OR o.buyer_id = auth.uid())));

DROP POLICY IF EXISTS p2p_rep_read ON p2p_reputation;
CREATE POLICY p2p_rep_read ON p2p_reputation FOR SELECT TO authenticated USING (true);

-- audit: solo admins (vía funciones SECURITY DEFINER)
