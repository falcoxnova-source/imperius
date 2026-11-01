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

  // =============================================
  // 1. Fix get_weekly_revenue_snapshots - convert withdrawal_fee USDT to FXU
  // =============================================
  console.log('1. Updating get_weekly_revenue_snapshots...');
  await c.query(`
CREATE OR REPLACE FUNCTION get_weekly_revenue_snapshots(p_limit integer DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_snapshots jsonb;
  v_current_week_breakdown jsonb;
  v_current_week_total numeric;
  v_current_week_start date;
  v_current_week_end date;
  v_current_week_number integer;
  v_current_year integer;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_current_week_start := DATE_TRUNC('week', CURRENT_DATE)::date;
  v_current_week_end := (v_current_week_start + INTERVAL '6 days')::date;
  v_current_week_number := EXTRACT(WEEK FROM v_current_week_start);
  v_current_year := EXTRACT(YEAR FROM v_current_week_start);

  -- Calculate current week breakdown, converting withdrawal_fee from USDT to FXU (x10000)
  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_current_week_breakdown, v_current_week_total
  FROM (
    SELECT
      revenue_type,
      SUM(
        CASE
          WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
          ELSE amount
        END
      ) AS type_total
    FROM admin_revenue
    WHERE created_at >= v_current_week_start::timestamptz
      AND created_at < (v_current_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.week_start DESC), '[]'::jsonb)
  INTO v_snapshots
  FROM (
    SELECT
      id,
      week_start,
      week_end,
      week_number,
      year,
      breakdown,
      total::float,
      created_at
    FROM weekly_revenue_snapshots
    ORDER BY week_start DESC
    LIMIT p_limit
  ) s;

  RETURN jsonb_build_object(
    'success', true,
    'current_week', jsonb_build_object(
      'week_start', v_current_week_start,
      'week_end', v_current_week_end,
      'week_number', v_current_week_number,
      'year', v_current_year,
      'breakdown', v_current_week_breakdown,
      'total', v_current_week_total::float,
      'is_current', true
    ),
    'snapshots', v_snapshots
  );
END;
$$;
  `);
  console.log('   ✅ get_weekly_revenue_snapshots updated');

  // =============================================
  // 2. Fix take_weekly_revenue_snapshot - convert withdrawal_fee USDT to FXU
  // =============================================
  console.log('2. Updating take_weekly_revenue_snapshot...');
  await c.query(`
CREATE OR REPLACE FUNCTION take_weekly_revenue_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date;
  v_week_end date;
  v_week_number integer;
  v_year integer;
  v_breakdown jsonb;
  v_total numeric;
  v_existing_id uuid;
BEGIN
  v_week_start := DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 day')::date;
  v_week_end := (v_week_start + INTERVAL '6 days')::date;
  v_week_number := EXTRACT(WEEK FROM v_week_start);
  v_year := EXTRACT(YEAR FROM v_week_start);

  SELECT id INTO v_existing_id
  FROM weekly_revenue_snapshots
  WHERE week_start = v_week_start AND year = v_year;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Snapshot already exists for week ' || v_week_number || ' of ' || v_year
    );
  END IF;

  -- Aggregate with withdrawal_fee converted from USDT to FXU (x10000)
  SELECT
    COALESCE(jsonb_object_agg(revenue_type, type_total), '{}'::jsonb),
    COALESCE(SUM(type_total), 0)
  INTO v_breakdown, v_total
  FROM (
    SELECT
      revenue_type,
      SUM(
        CASE
          WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000
          ELSE amount
        END
      ) AS type_total
    FROM admin_revenue
    WHERE created_at >= v_week_start::timestamptz
      AND created_at < (v_week_end + INTERVAL '1 day')::timestamptz
    GROUP BY revenue_type
  ) sub;

  INSERT INTO weekly_revenue_snapshots (week_start, week_end, week_number, year, breakdown, total)
  VALUES (v_week_start, v_week_end, v_week_number, v_year, v_breakdown, v_total);

  RETURN jsonb_build_object(
    'success', true,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'week_number', v_week_number,
    'year', v_year,
    'total', v_total
  );
END;
$$;
  `);
  console.log('   ✅ take_weekly_revenue_snapshot updated');

  // =============================================
  // 3. Fix historical snapshots - convert withdrawal_fee from USDT to FXU
  // =============================================
  console.log('3. Fixing historical snapshots...');
  
  // Get all snapshots that have withdrawal_fee in breakdown
  const snapshots = await c.query(`
    SELECT id, breakdown, total
    FROM weekly_revenue_snapshots
    WHERE breakdown ? 'withdrawal_fee'
  `);

  console.log(`   Found ${snapshots.rows.length} snapshots with withdrawal_fee`);

  for (const snap of snapshots.rows) {
    const oldVal = parseFloat(snap.breakdown.withdrawal_fee) || 0;
    if (oldVal > 0 && oldVal < 100) {
      // Likely a USDT value (small number), convert to FXU
      const newVal = oldVal * 10000;
      const oldTotal = parseFloat(snap.total);
      const newTotal = oldTotal - oldVal + newVal;

      await c.query(`
        UPDATE weekly_revenue_snapshots
        SET breakdown = jsonb_set(breakdown, '{withdrawal_fee}', to_jsonb($1::numeric)),
            total = $2
        WHERE id = $3
      `, [newVal, newTotal, snap.id]);

      console.log(`   Snapshot ${snap.id}: withdrawal_fee ${oldVal} USDT → ${newVal} FXU, total ${oldTotal} → ${newTotal}`);
    }
  }

  console.log('   ✅ Historical snapshots fixed');

  // Verify current week
  const verify = await c.query(`
    SELECT revenue_type, 
           SUM(amount) as raw_total,
           SUM(CASE WHEN revenue_type = 'withdrawal_fee' THEN amount * 10000 ELSE amount END) as converted_total
    FROM admin_revenue
    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)::timestamptz
    GROUP BY revenue_type
    ORDER BY converted_total DESC
  `);
  console.log('\n=== Current week (with conversion) ===');
  let grandTotal = 0;
  verify.rows.forEach(r => {
    const isWF = r.revenue_type === 'withdrawal_fee';
    const fxu = parseFloat(r.converted_total);
    const usd = fxu * 0.0001;
    grandTotal += fxu;
    console.log(`  ${r.revenue_type}: ${fxu.toLocaleString()} FXU ($${usd.toFixed(2)})${isWF ? ' [converted from ' + parseFloat(r.raw_total).toFixed(4) + ' USDT]' : ''}`);
  });
  console.log(`  TOTAL: ${grandTotal.toLocaleString()} FXU ($${(grandTotal * 0.0001).toFixed(2)})`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
