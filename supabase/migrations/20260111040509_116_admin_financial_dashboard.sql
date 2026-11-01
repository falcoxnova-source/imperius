/*
  # Admin Financial Dashboard System - Part 1
  
  1. Tablas Nuevas
    - admin_revenue: Registro de ingresos del admin
  
  2. Funciones Basicas
    - record_admin_revenue: Registra un ingreso
    - get_platform_financial_stats: Estadisticas completas
*/

CREATE TABLE IF NOT EXISTS admin_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_type text NOT NULL CHECK (revenue_type IN (
    'market_fee', 'withdrawal_fee', 'instant_build', 
    'instant_research', 'instant_ship', 'referral_bonus', 'other'
  )),
  amount numeric(20,8) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  description text,
  related_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  related_tx_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_revenue_type ON admin_revenue(revenue_type);
CREATE INDEX IF NOT EXISTS idx_admin_revenue_created ON admin_revenue(created_at);

ALTER TABLE admin_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all revenue"
  ON admin_revenue FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "System can insert revenue"
  ON admin_revenue FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION record_admin_revenue(
  p_revenue_type text,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_related_user_id uuid DEFAULT NULL,
  p_related_tx_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_revenue_id uuid;
BEGIN
  IF p_amount <= 0 THEN RETURN NULL; END IF;
  
  INSERT INTO admin_revenue (revenue_type, amount, description, related_user_id, related_tx_id)
  VALUES (p_revenue_type, p_amount, p_description, p_related_user_id, p_related_tx_id)
  RETURNING id INTO v_revenue_id;
  
  RETURN v_revenue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_platform_financial_stats()
RETURNS jsonb AS $$
DECLARE
  v_total_user_fxu numeric;
  v_total_revenue numeric;
  v_total_deposits numeric;
  v_total_withdrawals numeric;
  v_pending_withdrawals numeric;
  v_month_revenue numeric;
  v_year_revenue numeric;
  v_cm integer;
  v_cy integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  v_cm := EXTRACT(MONTH FROM now())::integer;
  v_cy := EXTRACT(YEAR FROM now())::integer;
  
  SELECT COALESCE(SUM(fxu_balance), 0) INTO v_total_user_fxu
  FROM profiles WHERE is_admin = false OR is_admin IS NULL;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue FROM admin_revenue;
  
  SELECT COALESCE(SUM(fxu_amount), 0) INTO v_total_deposits
  FROM wallet_transactions WHERE tx_type = 'deposit' AND status = 'confirmed';
  
  SELECT COALESCE(SUM(amount), 0) INTO v_total_withdrawals
  FROM wallet_transactions WHERE tx_type = 'withdrawal' AND status = 'confirmed';
  
  SELECT COALESCE(SUM(amount), 0) INTO v_pending_withdrawals
  FROM wallet_transactions WHERE tx_type = 'withdrawal' AND status = 'pending';
  
  SELECT COALESCE(SUM(amount), 0) INTO v_month_revenue
  FROM admin_revenue WHERE EXTRACT(YEAR FROM created_at) = v_cy AND EXTRACT(MONTH FROM created_at) = v_cm;
  
  SELECT COALESCE(SUM(amount), 0) INTO v_year_revenue
  FROM admin_revenue WHERE EXTRACT(YEAR FROM created_at) = v_cy;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_user_fxu', v_total_user_fxu,
    'total_deposits', v_total_deposits,
    'total_withdrawals', v_total_withdrawals,
    'pending_withdrawals', v_pending_withdrawals,
    'total_admin_revenue', v_total_revenue,
    'month_revenue', v_month_revenue,
    'year_revenue', v_year_revenue,
    'admin_available_balance', v_total_revenue,
    'current_month', v_cm,
    'current_year', v_cy
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
