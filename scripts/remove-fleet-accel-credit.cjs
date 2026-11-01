const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connected to database');

  // 1. Update get_user_lifetime_fxu_spent - remove fleet_acceleration
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
  console.log('✅ get_user_lifetime_fxu_spent updated (fleet_acceleration removed)');

  // 2. Update calculate_running_fxu_credit - remove fleet_acceleration
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
        SELECT created_at, amount as delta, 'SPEND' as event_type
        FROM admin_revenue
        WHERE related_user_id = p_user_id
          AND revenue_type IN (
            'plus_subscription', 'officer_fxu',
            'instant_ship', 'instant_build', 'instant_research', 'supply_box'
          )

        UNION ALL

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
  console.log('✅ calculate_running_fxu_credit updated (fleet_acceleration removed)');

  // 3. Quick verification - check a user's credit before/after would differ
  const res = await client.query(`
    SELECT 
      ar.related_user_id,
      p.username,
      SUM(ar.amount) as fleet_accel_total
    FROM admin_revenue ar
    JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type = 'fleet_acceleration'
    GROUP BY ar.related_user_id, p.username
    ORDER BY fleet_accel_total DESC
    LIMIT 10;
  `);
  
  if (res.rows.length > 0) {
    console.log('\n📊 Users affected (had fleet_acceleration spending):');
    for (const row of res.rows) {
      console.log(`  ${row.username}: ${row.fleet_accel_total} FXU will no longer count as credit`);
    }
  } else {
    console.log('\n📊 No users had fleet_acceleration spending');
  }

  await client.end();
  console.log('\n✅ Done! fleet_acceleration no longer counts for credit/ROI');
}

main().catch(e => { console.error(e); process.exit(1); });
