const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function deploy() {
  await client.connect();
  console.log('Connected to database');

  // 1. get_user_lifetime_fxu_spent — NO cutoff (all history)
  console.log('\n1. Deploying get_user_lifetime_fxu_spent (NO cutoff)...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.get_user_lifetime_fxu_spent(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_total numeric;
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO v_total
      FROM admin_revenue
      WHERE related_user_id = p_user_id
        AND revenue_type IN (
          'plus_subscription',
          'fleet_acceleration',
          'officer_fxu',
          'instant_ship',
          'instant_build',
          'instant_research',
          'supply_box'
        );
      RETURN v_total;
    END;
    $function$;
  `);
  console.log('   ✅ Done');

  // 2. calculate_running_fxu_credit — spending NO cutoff, sales WITH cutoff
  console.log('\n2. Deploying calculate_running_fxu_credit (asymmetric cutoff)...');
  await client.query(`
    CREATE OR REPLACE FUNCTION public.calculate_running_fxu_credit(p_user_id uuid)
    RETURNS numeric
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_cutoff timestamptz;
      v_credit numeric := 0;
      v_row RECORD;
    BEGIN
      SELECT earnings_cutoff_date INTO v_cutoff
      FROM market_resource_limits WHERE id = 1;

      FOR v_row IN (
        -- Spending: ALL history, NO cutoff
        SELECT created_at, amount as delta, 'SPEND' as event_type
        FROM admin_revenue
        WHERE related_user_id = p_user_id
          AND revenue_type IN (
            'plus_subscription', 'fleet_acceleration', 'officer_fxu',
            'instant_ship', 'instant_build', 'instant_research', 'supply_box'
          )

        UNION ALL

        -- Sales: only from cutoff onward
        SELECT mt.created_at, mt.total_price as delta, 'SALE' as event_type
        FROM market_transactions mt
        JOIN market_listings ml ON ml.id = mt.listing_id
        WHERE mt.seller_id = p_user_id
          AND ml.listing_type IN ('resource', 'ship')
          AND (v_cutoff IS NULL OR mt.created_at >= v_cutoff)

        ORDER BY created_at ASC
      ) LOOP
        IF v_row.event_type = 'SPEND' THEN
          v_credit := v_credit + v_row.delta;
        ELSE
          v_credit := v_credit - v_row.delta;
          IF v_credit < 0 THEN
            v_credit := 0;
          END IF;
        END IF;
      END LOOP;

      RETURN v_credit;
    END;
    $function$;
  `);
  console.log('   ✅ Done');

  // 3. Verify with key players
  console.log('\n========== VERIFICATION ==========');
  
  const players = await client.query(`
    SELECT p.id, p.username,
      get_user_lifetime_fxu_spent(p.id) as total_spent,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit
    FROM profiles p
    WHERE get_user_lifetime_fxu_spent(p.id) > 0
    ORDER BY get_user_lifetime_fxu_spent(p.id) DESC
    LIMIT 20
  `);

  console.log('\nAll investors (spending=ALL history, sales=from cutoff only):');
  console.log('─'.repeat(70));
  for (const r of players.rows) {
    console.log(`${r.username.padEnd(20)} spent: ${Number(r.total_spent).toLocaleString().padStart(12)}  credit: ${Number(r.fxu_credit).toLocaleString().padStart(12)}  limit: ${Number(r.fxu_limit).toLocaleString().padStart(12)}`);
  }

  // Specific check: MAIKOL
  const maikol = await client.query(`
    SELECT p.username,
      get_user_lifetime_fxu_spent(p.id) as spent,
      calculate_running_fxu_credit(p.id) as credit
    FROM profiles p WHERE LOWER(p.username) = 'maikol'
  `);
  if (maikol.rows.length > 0) {
    const m = maikol.rows[0];
    console.log(`\n🔍 MAIKOL check: spent=${Number(m.spent).toLocaleString()}, credit=${Number(m.credit).toLocaleString()}`);
  }

  await client.end();
  console.log('\n✅ All deployed successfully');
}

deploy().catch(e => { console.error(e); process.exit(1); });
