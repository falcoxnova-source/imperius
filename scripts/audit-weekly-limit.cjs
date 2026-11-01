const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function audit() {
  await client.connect();
  console.log('=== WEEKLY LIMIT AUDIT FOR VIP USER ===\n');

  // 1. Get Luciffer Walker's data
  const user = await client.query(`
    SELECT id, username, points_total, fxu_balance, rank_position
    FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1
  `);
  const u = user.rows[0];
  console.log(`User: ${u.username} | Points: ${u.points_total} | Rank: ${u.rank_position} | FXU: ${parseFloat(u.fxu_balance).toFixed(2)}`);

  // 2. Get their lifetime FXU spent (via admin_revenue)
  const spent = await client.query(`
    SELECT COALESCE(SUM(amount), 0) as total_spent
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN (
      'instant_build', 'instant_research', 'instant_ship',
      'officer_fxu', 'supply_box', 'fleet_acceleration',
      'expedition_fee', 'swap_fee', 'transfer_fee',
      'plus_subscription'
    )
  `, [u.id]);
  console.log(`FXU spent (lifetime): ${spent.rows[0].total_spent}`);

  // 2b. Breakdown by type
  const spentBreakdown = await client.query(`
    SELECT revenue_type, SUM(amount) as total, COUNT(*) as count
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN (
      'instant_build', 'instant_research', 'instant_ship',
      'officer_fxu', 'supply_box', 'fleet_acceleration',
      'expedition_fee', 'swap_fee', 'transfer_fee',
      'plus_subscription'
    )
    GROUP BY revenue_type ORDER BY total DESC
  `, [u.id]);
  spentBreakdown.rows.forEach(r => {
    console.log(`  ${r.revenue_type}: ${parseFloat(r.total).toFixed(2)} (${r.count} transactions)`);
  });

  // 3. Get their market earnings (total_price from market_transactions as seller)
  const earned = await client.query(`
    SELECT COALESCE(SUM(total_price), 0) as total_earned
    FROM market_transactions
    WHERE seller_id = $1
  `, [u.id]);
  console.log(`\nFXU earned from market sales: ${earned.rows[0].total_earned}`);

  // 4. Calculate their weekly limit
  const fxuCredit = Math.max(0, parseFloat(spent.rows[0].total_spent) - parseFloat(earned.rows[0].total_earned));
  const weeklyLimit = parseInt(u.points_total) + Math.floor(fxuCredit);
  console.log(`\n--- WEEKLY LIMIT CALCULATION ---`);
  console.log(`  Points: ${u.points_total}`);
  console.log(`  FXU Credit: max(0, ${parseFloat(spent.rows[0].total_spent).toFixed(2)} - ${parseFloat(earned.rows[0].total_earned).toFixed(2)}) = ${fxuCredit.toFixed(2)}`);
  console.log(`  Weekly Limit = ${u.points_total} + floor(${fxuCredit.toFixed(2)}) = ${weeklyLimit}`);

  // 5. Check DB function result
  const dbLimit = await client.query(`SELECT calculate_monthly_market_limit($1) as limit_val`, [u.id]);
  console.log(`  DB function result: ${dbLimit.rows[0].limit_val}`);

  // 6. Get what they've sold THIS week
  const weekKey = await client.query(`SELECT to_char(now(), 'IYYY-"W"IW') as week_key`);
  console.log(`\nCurrent ISO week: ${weekKey.rows[0].week_key}`);

  const thisWeekSales = await client.query(`
    SELECT resource_type, SUM(quantity_sold) as total_sold
    FROM market_monthly_sales
    WHERE user_id = $1 AND year_week = $2
    GROUP BY resource_type
  `, [u.id, weekKey.rows[0].week_key]);
  console.log(`Sales this week:`);
  if (thisWeekSales.rows.length === 0) {
    console.log(`  (none)`);
  } else {
    thisWeekSales.rows.forEach(r => {
      console.log(`  ${r.resource_type}: ${r.total_sold}`);
    });
  }

  // 7. Active listings this week
  const activeListings = await client.query(`
    SELECT item_code, SUM(quantity) as total_qty
    FROM market_listings
    WHERE seller_id = $1 AND status = 'active'
    AND to_char(created_at, 'IYYY-"W"IW') = $2
    GROUP BY item_code
  `, [u.id, weekKey.rows[0].week_key]);
  console.log(`Active listings this week:`);
  if (activeListings.rows.length === 0) {
    console.log(`  (none)`);
  } else {
    activeListings.rows.forEach(r => {
      console.log(`  ${r.item_code}: ${r.total_qty}`);
    });
  }

  // 8. Check full RPC result
  console.log('\n--- get_my_monthly_market_sales RPC result ---');
  const rpcCols = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'market_resource_limits'
  `);
  console.log('market_resource_limits columns:', rpcCols.rows.map(r => r.column_name).join(', '));

  const limitToggle = await client.query(`SELECT * FROM market_resource_limits WHERE id = 1`);
  console.log('Limits enabled:', limitToggle.rows[0]);

  // 9. Check the get_user_lifetime_fxu_spent function source
  console.log('\n--- get_user_lifetime_fxu_spent SOURCE ---');
  const fxuSpentFunc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_user_lifetime_fxu_spent'
  `);
  if (fxuSpentFunc.rows.length > 0) {
    console.log(fxuSpentFunc.rows[0].prosrc);
  }

  // 10. Check get_user_market_earnings function source
  console.log('\n--- get_user_market_earnings SOURCE ---');
  const earningsFunc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_user_market_earnings'
  `);
  if (earningsFunc.rows.length > 0) {
    console.log(earningsFunc.rows[0].prosrc);
  }

  // 11. Check calculate_monthly_market_limit source
  console.log('\n--- calculate_monthly_market_limit SOURCE ---');
  const limitFunc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'calculate_monthly_market_limit'
  `);
  if (limitFunc.rows.length > 0) {
    console.log(limitFunc.rows[0].prosrc);
  }

  await client.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
