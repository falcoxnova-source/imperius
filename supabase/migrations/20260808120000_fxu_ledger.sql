-- =============================================================================
-- LEDGER DE MOVIMIENTOS TUNG/FXU DEL JUGADOR
-- =============================================================================
-- Problema que resuelve:
--   El jugador solo veia "Total Depositado" vs "Balance" en la Wallet, sin
--   ningun historial de sus gastos DENTRO del juego (cajas, completar al
--   instante, oficiales, loteria...). Eso genera reclamaciones de tipo
--   "mi deposito no se acredito" cuando en realidad el saldo se gasto.
--
-- Estrategia (maxima robustez, cero cambios en la logica de negocio):
--   1) Tabla fxu_ledger.
--   2) Trigger AFTER UPDATE en profiles -> captura TODO cambio de fxu_balance,
--      venga de la funcion que venga (presente o futura). Imposible que se
--      escape un movimiento.
--   3) Trigger AFTER INSERT en admin_revenue -> pone la etiqueta/descripcion
--      al gasto del jugador (cubre los 12 RPC que pasan por
--      distribute_spend_fee) sin tener que recrear ninguna de ellas.
--   4) Los depositos/retiros se identifican dentro del propio trigger
--      cruzando con wallet_transactions de la misma transaccion.
--   5) Todo el trigger va dentro de un bloque EXCEPTION: si algo fallara,
--      NUNCA puede bloquear una operacion del juego.
--   6) Backfill del historico existente.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabla
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fxu_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta           numeric NOT NULL,
  balance_before  numeric,
  balance_after   numeric,
  category        text,
  description     text,
  related_id      uuid,
  is_estimated    boolean NOT NULL DEFAULT false,
  txid            bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fxu_ledger_user_date
  ON public.fxu_ledger (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_fxu_ledger_pending_tag
  ON public.fxu_ledger (user_id, txid) WHERE category IS NULL;

COMMENT ON TABLE public.fxu_ledger IS
  'Historial de movimientos de TUNG/FXU del jugador. Se alimenta automaticamente por trigger sobre profiles.fxu_balance.';

-- ---------------------------------------------------------------------------
-- 2) RLS: cada jugador solo ve lo suyo. Nadie puede escribir desde el cliente.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fxu_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fxu_ledger_select_own ON public.fxu_ledger;
CREATE POLICY fxu_ledger_select_own ON public.fxu_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.fxu_ledger FROM authenticated, anon;
GRANT SELECT ON public.fxu_ledger TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Trigger sobre profiles: registra cualquier cambio de saldo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_fxu_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_delta    numeric;
  v_cat      text;
  v_desc     text;
  v_rel      uuid;
BEGIN
  BEGIN
    v_delta := COALESCE(NEW.fxu_balance, 0) - COALESCE(OLD.fxu_balance, 0);
    IF v_delta = 0 THEN
      RETURN NULL;
    END IF;

    -- Deposito / retiro: la fila de wallet_transactions se crea en la MISMA
    -- transaccion y antes de mover el saldo, asi que ya esta disponible.
    SELECT wt.tx_type,
           'On-chain ' || wt.tx_type || ' ' || COALESCE(wt.token_type, 'TUNG'),
           wt.id
      INTO v_cat, v_desc, v_rel
    FROM public.wallet_transactions wt
    WHERE wt.user_id = NEW.id
      AND wt.created_at = now()
    ORDER BY wt.created_at DESC
    LIMIT 1;

    INSERT INTO public.fxu_ledger (
      user_id, delta, balance_before, balance_after,
      category, description, related_id, txid
    ) VALUES (
      NEW.id,
      v_delta,
      COALESCE(OLD.fxu_balance, 0),
      COALESCE(NEW.fxu_balance, 0),
      v_cat,
      v_desc,
      v_rel,
      txid_current()
    );
  EXCEPTION WHEN OTHERS THEN
    -- El ledger es informativo: jamas debe tumbar una operacion del juego.
    NULL;
  END;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS log_fxu_movement_trigger ON public.profiles;
CREATE TRIGGER log_fxu_movement_trigger
AFTER UPDATE ON public.profiles
FOR EACH ROW
WHEN (OLD.fxu_balance IS DISTINCT FROM NEW.fxu_balance)
EXECUTE FUNCTION public.log_fxu_movement();

-- ---------------------------------------------------------------------------
-- 4) Trigger sobre admin_revenue: etiqueta el gasto del jugador
--    (distribute_spend_fee siempre registra aqui el concepto y la descripcion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tag_fxu_movement_from_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  BEGIN
    IF NEW.related_user_id IS NULL
       OR NEW.revenue_type = 'deposit_gas_buffer' THEN
      RETURN NULL;
    END IF;

    UPDATE public.fxu_ledger l
       SET category    = NEW.revenue_type,
           description = COALESCE(NEW.description, l.description),
           related_id  = COALESCE(l.related_id, NEW.related_tx_id)
     WHERE l.user_id  = NEW.related_user_id
       AND l.txid     = txid_current()
       AND l.category IS NULL
       AND l.delta    < 0;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS tag_fxu_movement_from_revenue_trigger ON public.admin_revenue;
CREATE TRIGGER tag_fxu_movement_from_revenue_trigger
AFTER INSERT ON public.admin_revenue
FOR EACH ROW
EXECUTE FUNCTION public.tag_fxu_movement_from_revenue();

-- ---------------------------------------------------------------------------
-- 5) Backfill del historico (solo una vez)
-- ---------------------------------------------------------------------------
DO $backfill$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fxu_ledger LIMIT 1) THEN
    RETURN;
  END IF;

  -- 5.a Depositos y retiros on-chain (importes exactos)
  INSERT INTO public.fxu_ledger (user_id, delta, category, description, related_id, is_estimated, created_at)
  SELECT wt.user_id,
         CASE WHEN wt.tx_type = 'deposit' THEN wt.fxu_amount ELSE -wt.fxu_amount END,
         wt.tx_type,
         'On-chain ' || wt.tx_type || ' ' || COALESCE(wt.token_type, 'TUNG'),
         wt.id,
         false,
         wt.created_at
  FROM public.wallet_transactions wt
  WHERE wt.user_id IS NOT NULL
    AND wt.status = 'confirmed'
    AND COALESCE(wt.fxu_amount, 0) > 0;

  -- 5.b Gastos dentro del juego. En admin_revenue solo se guarda la parte de
  --     la empresa (40% del gasto: 50% pool + 50% empresa, y de la empresa un
  --     20% al referido). Se reconstruye el importe gastado dividiendo /0.40.
  --     Se marca is_estimated = true porque es una reconstruccion.
  INSERT INTO public.fxu_ledger (user_id, delta, category, description, related_id, is_estimated, created_at)
  SELECT ar.related_user_id,
         -ROUND(ar.amount / 0.40, 2),
         ar.revenue_type,
         ar.description,
         ar.related_tx_id,
         true,
         ar.created_at
  FROM public.admin_revenue ar
  WHERE ar.related_user_id IS NOT NULL
    AND ar.revenue_type <> 'deposit_gas_buffer'
    AND COALESCE(ar.currency, 'FXU') = 'FXU'
    AND ar.amount > 0;
END;
$backfill$;

NOTIFY pgrst, 'reload schema';
