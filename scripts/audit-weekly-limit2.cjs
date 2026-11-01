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

  // 1. Check market_monthly_sales columns
  const cols = await client.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'market_monthly_sales' ORDER BY ordinal_position
  `);
  console.log('=== market_monthly_sales columns ===');
  cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // 2. Get Luciffer Walker's data
  const user = await client.query(`
    SELECT id, username, points_total FROM profiles WHERE username LIKE '%Luciffer%' LIMIT 1
  `);
  const uid = user.rows[0].id;

  // 3. Week key
  const weekKey = await client.query(`SELECT to_char(now(), 'IYYY-"W"IW') as week_key`);
  console.log(`\nCurrent ISO week: ${weekKey.rows[0].week_key}`);

  // 4. Check market_monthly_sales for this user
  const sales = await client.query(`SELECT * FROM market_monthly_sales WHERE user_id = $1 ORDER BY year_week DESC LIMIT 20`, [uid]);
  console.log(`\n=== market_monthly_sales for Luciffer (last 20) ===`);
  sales.rows.forEach(r => console.log(r));

  // 5. Check this week specifically
  const thisWeek = await client.query(`SELECT * FROM market_monthly_sales WHERE user_id = $1 AND year_week = $2`, [uid, weekKey.rows[0].week_key]);
  console.log(`\n=== This week sales ===`);
  thisWeek.rows.forEach(r => console.log(r));

  // 6. Check active listings
  const active = await client.query(`
    SELECT item_code, quantity, unit_price, created_at
    FROM market_listings
    WHERE seller_id = $1 AND status = 'active'
    ORDER BY created_at DESC LIMIT 10
  `, [uid]);
  console.log(`\n=== Active listings ===`);
  active.rows.forEach(r => console.log(`  ${r.item_code}: qty=${r.quantity} price=${r.unit_price} at ${r.created_at}`));

  // 7. Get full calculate_monthly_market_limit source
  console.log('\n=== calculate_monthly_market_limit SOURCE ===');
  const limitFunc = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'calculate_monthly_market_limit'`);
  if (limitFunc.rows.length > 0) console.log(limitFunc.rows[0].prosrc);

  // 8. Get full create_market_listing source (to see how limits are enforced)
  console.log('\n=== create_market_listing SOURCE ===');
  const createFunc = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'create_market_listing'`);
  if (createFunc.rows.length > 0) console.log(createFunc.rows[0].prosrc);

  // 9. Get get_my_monthly_market_sales source
  console.log('\n=== get_my_monthly_market_sales SOURCE ===');
  const myFunc = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'`);
  if (myFunc.rows.length > 0) console.log(myFunc.rows[0].prosrc);

  // 10. Check market_resource_limits
  const toggle = await client.query(`SELECT * FROM market_resource_limits WHERE id = 1`);
  console.log('\n=== market_resource_limits ===');
  console.log(toggle.rows[0]);

  // 11. Check plus_subscriptions for the user
  const plus = await client.query(`SELECT * FROM plus_subscriptions WHERE user_id = $1`, [uid]);
  console.log('\n=== plus_subscriptions ===');
  plus.rows.forEach(r => console.log(r));

  await client.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
