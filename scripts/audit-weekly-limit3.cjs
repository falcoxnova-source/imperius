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

  // 1. Get Luciffer Walker's data
  const user = await client.query(`
    SELECT id, username, points_total, fxu_balance, rank_position
    FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1
  `);
  const u = user.rows[0];
  const uid = u.id;
  console.log(`User: ${u.username} | Points: ${u.points_total} | Rank: ${u.rank_position} | FXU: ${parseFloat(u.fxu_balance).toFixed(2)}`);

  // 2. Week/Month key
  const timeKeys = await client.query(`
    SELECT to_char(now(), 'IYYY-"W"IW') as week_key,
           to_char(now(), 'YYYY-MM') as month_key
  `);
  console.log(`\nISO week: ${timeKeys.rows[0].week_key} | Month: ${timeKeys.rows[0].month_key}`);

  // 3. All market_monthly_sales for this user
  const sales = await client.query(`SELECT * FROM market_monthly_sales WHERE user_id = $1 ORDER BY year_month DESC LIMIT 20`, [uid]);
  console.log(`\n=== market_monthly_sales ===`);
  sales.rows.forEach(r => console.log(`  ${r.year_month}: metal=${r.metal_sold} crystal=${r.crystal_sold} deut=${r.deuterium_sold} ships=${r.ships_value_sold}`));

  // 4. DB function result
  const dbLimit = await client.query(`SELECT calculate_monthly_market_limit($1) as lim`, [uid]);
  console.log(`\nDB calculated limit: ${dbLimit.rows[0].lim}`);

  // 5. Full calculate_monthly_market_limit source
  console.log('\n=== calculate_monthly_market_limit SOURCE ===');
  const f1 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_monthly_market_limit'`);
  if (f1.rows.length > 0) console.log(f1.rows[0].prosrc);

  // 6. Full create_market_listing source
  console.log('\n=== create_market_listing SOURCE ===');
  const f2 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'create_market_listing'`);
  if (f2.rows.length > 0) console.log(f2.rows[0].prosrc);

  // 7. Full get_my_monthly_market_sales source
  console.log('\n=== get_my_monthly_market_sales SOURCE ===');
  const f3 = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'`);
  if (f3.rows.length > 0) console.log(f3.rows[0].prosrc);

  // 8. market_resource_limits
  const toggle = await client.query(`SELECT * FROM market_resource_limits WHERE id = 1`);
  console.log('\n=== market_resource_limits ===');
  console.log(toggle.rows[0]);

  // 9. Plus subscription
  const plus = await client.query(`SELECT * FROM plus_subscriptions WHERE user_id = $1`, [uid]);
  console.log('\n=== plus_subscriptions ===');
  plus.rows.forEach(r => console.log(r));

  // 10. FXU spent breakdown
  const spent = await client.query(`
    SELECT revenue_type, SUM(amount) as total, COUNT(*) as cnt
    FROM admin_revenue
    WHERE related_user_id = $1
    AND revenue_type IN (
      'instant_build', 'instant_research', 'instant_ship',
      'officer_fxu', 'supply_box', 'fleet_acceleration',
      'expedition_fee', 'swap_fee', 'transfer_fee',
      'plus_subscription'
    )
    GROUP BY revenue_type ORDER BY total DESC
  `, [uid]);
  const totalSpent = spent.rows.reduce((s, r) => s + parseFloat(r.total), 0);
  console.log(`\n=== FXU Spent: ${totalSpent.toFixed(2)} ===`);
  spent.rows.forEach(r => console.log(`  ${r.revenue_type}: ${parseFloat(r.total).toFixed(2)} (${r.cnt}x)`));

  // 11. FXU earned from selling
  const earned = await client.query(`SELECT COALESCE(SUM(total_price), 0) as total FROM market_transactions WHERE seller_id = $1`, [uid]);
  console.log(`\nFXU earned from market: ${parseFloat(earned.rows[0].total).toFixed(2)}`);

  // 12. Formula
  const fxuCredit = Math.max(0, totalSpent - parseFloat(earned.rows[0].total));
  const limit = parseInt(u.points_total) + Math.floor(fxuCredit);
  console.log(`\n=== FORMULA ===`);
  console.log(`  ${u.points_total} (points) + max(0, ${totalSpent.toFixed(2)} - ${parseFloat(earned.rows[0].total).toFixed(2)}) = ${u.points_total} + ${fxuCredit.toFixed(2)} = ${limit}`);
  console.log(`  Since earned (${parseFloat(earned.rows[0].total).toFixed(2)}) > spent (${totalSpent.toFixed(2)}), FXU credit = 0`);
  console.log(`  Weekly limit = ONLY points = ${u.points_total}`);

  // 13. How much more can they sell THIS month?
  const thisMonth = await client.query(`SELECT * FROM market_monthly_sales WHERE user_id = $1 AND year_month = $2`, [uid, timeKeys.rows[0].month_key]);
  if (thisMonth.rows.length > 0) {
    const m = thisMonth.rows[0];
    console.log(`\n=== THIS MONTH remaining capacity ===`);
    console.log(`  Metal sold: ${m.metal_sold} / ${limit} => remaining: ${limit - parseInt(m.metal_sold)}`);
    console.log(`  Crystal sold: ${m.crystal_sold} / ${limit} => remaining: ${limit - parseInt(m.crystal_sold)}`);
    console.log(`  Deut sold: ${m.deuterium_sold} / ${limit} => remaining: ${limit - parseInt(m.deuterium_sold)}`);
    console.log(`  Ships value: ${m.ships_value_sold} / ${limit} => remaining: ${limit - parseInt(m.ships_value_sold)}`);
  } else {
    console.log(`\n  No sales this period yet. Full capacity: ${limit} per resource type`);
  }

  // 14. To recover 100K FXU at 7.5% fee, they need to sell enough to earn 100K after fee
  // If fee is 7.5%, seller gets 92.5% of listing price
  // So they need to sell items worth 100000 / 0.925 = 108,108 FXU total
  console.log(`\n=== RECOVERY ANALYSIS ===`);
  console.log(`  VIP cost: 100,000 FXU`);
  console.log(`  Market fee (VIP): 7.5%`);
  console.log(`  To recover 100K FXU, need total sales of: ${Math.ceil(100000 / 0.925)} FXU`);
  console.log(`  Current weekly limit: ${limit} (per resource type)`);
  console.log(`  If all 3 resources maxed each week: ${limit * 3} total resource units/week`);

  await client.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
