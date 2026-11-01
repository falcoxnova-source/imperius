const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres'
});

(async () => {
  try {
    const client = await pool.connect();
    
    // 1. Check function source for VIP check
    const { rows: funcRows } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'
    `);
    const src = funcRows[0]?.prosrc || '';
    console.log('=== get_my_monthly_market_sales function ===');
    console.log('Contains is_user_plus check:', src.includes('is_user_plus'));
    console.log('Contains vip_unlimited:', src.includes('vip_unlimited'));
    console.log('First 800 chars:\n', src.substring(0, 800));
    
    // 2. Check plus_subscriptions for this user
    const { rows: subs } = await client.query(`
      SELECT id, user_id, plan_id, is_active, started_at, expires_at, payment_type, amount_paid
      FROM plus_subscriptions 
      WHERE user_id = '6516fcdc-95f9-47db-8479-eef6a7d09898'
    `);
    console.log('\n=== plus_subscriptions for gravekeeper ===');
    console.log(JSON.stringify(subs, null, 2));
    
    // 3. Check is_user_plus
    const { rows: plusCheck } = await client.query(`SELECT is_user_plus('6516fcdc-95f9-47db-8479-eef6a7d09898') as is_plus`);
    console.log('\n=== is_user_plus result ===');
    console.log(plusCheck[0]);
    
    // 4. Check create_market_listing for VIP check
    const { rows: createRows } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'create_market_listing'
    `);
    const createSrc = createRows[0]?.prosrc || '';
    console.log('\n=== create_market_listing ===');
    console.log('Contains is_user_plus check:', createSrc.includes('is_user_plus'));
    console.log('Contains VIP PLUS comment:', createSrc.includes('VIP PLUS'));
    
    // 5. Check which migrations were applied
    const { rows: migrations } = await client.query(`
      SELECT version, name FROM supabase_migrations.schema_migrations 
      WHERE name LIKE '%vip_market%' OR name LIKE '%dual_limit%' OR name LIKE '%ship_weekly%'
      ORDER BY version
    `);
    console.log('\n=== Related migrations applied ===');
    migrations.forEach(m => console.log(`  ${m.version} - ${m.name}`));
    
    client.release();
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
  }
})();
