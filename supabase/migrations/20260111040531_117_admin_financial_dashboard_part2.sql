/*
  # Admin Financial Dashboard - Part 2
  
  Funciones adicionales para reportes y triggers
*/

CREATE OR REPLACE FUNCTION get_monthly_revenue_breakdown(p_year integer DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_year integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM now())::integer);
  
  RETURN jsonb_build_object(
    'success', true,
    'year', v_year,
    'months', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'month', month_num,
          'total', total,
          'by_type', by_type
        ) ORDER BY month_num
      ), '[]'::jsonb)
      FROM (
        SELECT 
          EXTRACT(MONTH FROM created_at)::integer as month_num,
          SUM(amount) as total,
          jsonb_object_agg(revenue_type, type_sum) as by_type
        FROM (
          SELECT 
            created_at,
            revenue_type,
            SUM(amount) OVER (PARTITION BY EXTRACT(MONTH FROM created_at), revenue_type) as type_sum,
            amount
          FROM admin_revenue
          WHERE EXTRACT(YEAR FROM created_at) = v_year
        ) sub
        GROUP BY EXTRACT(MONTH FROM created_at)
      ) monthly
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_revenue_by_type(p_year integer DEFAULT NULL, p_month integer DEFAULT NULL)
RETURNS jsonb AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  RETURN (
    SELECT jsonb_build_object(
      'success', true,
      'breakdown', COALESCE(jsonb_object_agg(revenue_type, total), '{}'::jsonb),
      'total', COALESCE(SUM(total), 0)
    )
    FROM (
      SELECT revenue_type, SUM(amount) as total
      FROM admin_revenue
      WHERE (p_year IS NULL OR EXTRACT(YEAR FROM created_at) = p_year)
        AND (p_month IS NULL OR EXTRACT(MONTH FROM created_at) = p_month)
      GROUP BY revenue_type
    ) breakdown
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_recent_revenue(p_limit integer DEFAULT 20)
RETURNS jsonb AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'revenues', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', ar.id,
          'type', ar.revenue_type,
          'amount', ar.amount,
          'description', ar.description,
          'username', p.username,
          'created_at', ar.created_at
        ) ORDER BY ar.created_at DESC
      ), '[]'::jsonb)
      FROM (SELECT * FROM admin_revenue ORDER BY created_at DESC LIMIT p_limit) ar
      LEFT JOIN profiles p ON ar.related_user_id = p.id
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION trigger_record_withdrawal_fee()
RETURNS trigger AS $$
DECLARE
  v_fee_amount numeric;
BEGIN
  IF NEW.tx_type = 'withdrawal' AND NEW.status = 'confirmed' 
     AND (OLD.status IS NULL OR OLD.status != 'confirmed') THEN
    v_fee_amount := NEW.fxu_amount - NEW.amount;
    IF v_fee_amount > 0 THEN
      PERFORM record_admin_revenue('withdrawal_fee', v_fee_amount, 'Comision de retiro', NEW.user_id, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_withdrawal_fee_revenue ON wallet_transactions;
CREATE TRIGGER trigger_withdrawal_fee_revenue
  AFTER INSERT OR UPDATE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_record_withdrawal_fee();

GRANT EXECUTE ON FUNCTION record_admin_revenue TO authenticated;
GRANT EXECUTE ON FUNCTION get_platform_financial_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_revenue_breakdown TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_by_type TO authenticated;
GRANT EXECUTE ON FUNCTION get_recent_revenue TO authenticated;
