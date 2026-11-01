const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('Connected\n');

  // Helper: the CASE expression to convert withdrawal_fee from USDT to FXU
  // CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END

  // =============================================
  // 1. get_daily_revenue
  // =============================================
  console.log('1. Fixing get_daily_revenue...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_daily_revenue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  RETURN jsonb_build_object('success', true, 'data', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT DATE_TRUNC('hour', created_at) as hour,
             SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) as revenue,
             COUNT(*) as transactions
      FROM admin_revenue WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', created_at) ORDER BY hour DESC
    ) t
  ));
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 2. get_weekly_revenue
  // =============================================
  console.log('2. Fixing get_weekly_revenue...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_weekly_revenue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  RETURN jsonb_build_object('success', true, 'data', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT DATE(created_at) as date,
             SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) as revenue,
             COUNT(*) as transactions
      FROM admin_revenue WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at) ORDER BY date DESC
    ) t
  ));
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 3. get_monthly_revenue
  // =============================================
  console.log('3. Fixing get_monthly_revenue...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_monthly_revenue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  RETURN jsonb_build_object('success', true, 'data', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT DATE(created_at) as date,
             SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) as revenue,
             COUNT(*) as transactions
      FROM admin_revenue WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at) ORDER BY date DESC
    ) t
  ));
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 4. get_platform_financial_stats
  // =============================================
  console.log('4. Fixing get_platform_financial_stats...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_platform_financial_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_stats record;
  v_tx_stats record;
  v_revenue_stats record;
  v_admin_available numeric;
  v_current_month integer;
  v_current_year integer;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  v_current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  SELECT
    COALESCE(SUM(fxu_balance) FILTER (WHERE is_admin = false OR is_admin IS NULL), 0) as total_fxu,
    COALESCE(SUM(usdt_balance) FILTER (WHERE is_admin = false OR is_admin IS NULL), 0) as total_usdt
  INTO v_user_stats FROM profiles;

  SELECT
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'deposit' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL)), 0) as deposits_fxu,
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'deposit' AND status = 'confirmed' AND token_type = 'USDT'), 0) as deposits_usdt,
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND (token_type = 'FXU' OR token_type IS NULL)), 0) as withdrawals_fxu,
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'withdrawal' AND status = 'confirmed' AND token_type = 'USDT'), 0) as withdrawals_usdt,
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'withdrawal' AND status = 'pending' AND (token_type = 'FXU' OR token_type IS NULL)), 0) as pending_fxu,
    COALESCE(SUM(fxu_amount) FILTER (WHERE tx_type = 'withdrawal' AND status = 'pending' AND token_type = 'USDT'), 0) as pending_usdt
  INTO v_tx_stats FROM wallet_transactions;

  SELECT
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END), 0) as total_revenue,
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) FILTER (WHERE EXTRACT(MONTH FROM created_at) = v_current_month AND EXTRACT(YEAR FROM created_at) = v_current_year), 0) as month_revenue,
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) FILTER (WHERE EXTRACT(YEAR FROM created_at) = v_current_year), 0) as year_revenue
  INTO v_revenue_stats FROM admin_revenue;

  v_admin_available := get_admin_available_balance();

  RETURN jsonb_build_object(
    'success', true, 'total_user_fxu', v_user_stats.total_fxu, 'total_user_usdt', v_user_stats.total_usdt,
    'total_deposits', v_tx_stats.deposits_fxu, 'total_withdrawals', v_tx_stats.withdrawals_fxu,
    'pending_withdrawals', v_tx_stats.pending_fxu, 'total_deposits_usdt', v_tx_stats.deposits_usdt,
    'total_withdrawals_usdt', v_tx_stats.withdrawals_usdt, 'pending_withdrawals_usdt', v_tx_stats.pending_usdt,
    'total_admin_revenue', v_revenue_stats.total_revenue,
    'total_admin_expenses', COALESCE((SELECT SUM(amount) FROM admin_expenses), 0),
    'month_revenue', v_revenue_stats.month_revenue, 'year_revenue', v_revenue_stats.year_revenue,
    'admin_available_balance', v_admin_available, 'current_month', v_current_month, 'current_year', v_current_year
  );
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 5. get_revenue_summary
  // =============================================
  console.log('5. Fixing get_revenue_summary...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_revenue_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result record;
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END), 0) as total,
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day'), 0) as last_24h,
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0) as last_7d,
    COALESCE(SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) as last_30d,
    COUNT(*) as total_transactions
  INTO v_result FROM admin_revenue;

  RETURN jsonb_build_object('success', true, 'total_revenue', v_result.total, 'last_24h', v_result.last_24h,
    'last_7d', v_result.last_7d, 'last_30d', v_result.last_30d, 'total_transactions', v_result.total_transactions);
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 6. get_revenue_by_type
  // =============================================
  console.log('6. Fixing get_revenue_by_type...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_revenue_by_type()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  RETURN jsonb_build_object('success', true, 'data', (
    SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT revenue_type,
             SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) as total,
             COUNT(*) as count
      FROM admin_revenue GROUP BY revenue_type ORDER BY total DESC
    ) t
  ));
END;
$$;
  `);
  console.log('   ✅ done');

  // =============================================
  // 7. get_recent_revenue - individual entries, convert amount for withdrawal_fee
  // =============================================
  console.log('7. Fixing get_recent_revenue...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_recent_revenue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_user_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  RETURN jsonb_build_object('success', true, 'revenues', (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM (
      SELECT
        ar.id,
        ar.revenue_type as type,
        CASE WHEN ar.revenue_type = 'withdrawal_fee' THEN ar.amount * 10000 ELSE ar.amount END as amount,
        ar.amount as amount_original,
        ar.description,
        p.username,
        ar.created_at
      FROM admin_revenue ar
      LEFT JOIN profiles p ON p.id = ar.related_user_id
      ORDER BY ar.created_at DESC
      LIMIT p_limit
    ) t
  ));
END;
$$;
  `);
  console.log('   ✅ done');

  console.log('\n✅ All 7 revenue functions updated with withdrawal_fee USDT→FXU conversion');

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
