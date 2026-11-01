const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres'
});

(async () => {
  try {
    const client = await pool.connect();
    
    // Get full function source - check for VIP early return
    const { rows } = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'get_my_monthly_market_sales'
    `);
    const src = rows[0]?.prosrc || '';
    
    // Find the VIP check section
    const vipIdx = src.indexOf('is_user_plus');
    if (vipIdx >= 0) {
      console.log('=== VIP check section (500 chars around it) ===');
      console.log(src.substring(Math.max(0, vipIdx - 100), vipIdx + 400));
    }
    
    // Check RLS on plus_subscriptions
    const { rows: rlsRows } = await client.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename = 'plus_subscriptions'
    `);
    console.log('\n=== RLS policies on plus_subscriptions ===');
    rlsRows.forEach(r => {
      console.log(`Policy: ${r.policyname}`);
      console.log(`  roles: ${r.roles}, cmd: ${r.cmd}, permissive: ${r.permissive}`);
      console.log(`  qual: ${r.qual}`);
    });
    
    // Check if RLS is enabled
    const { rows: rlsEnabled } = await client.query(`
      SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'plus_subscriptions'
    `);
    console.log('\n=== RLS enabled? ===');
    console.log(rlsEnabled[0]);
    
    // Simulate what the browse tab does - query plus_subscriptions with authenticated role
    const { rows: allActive } = await client.query(`
      SELECT COUNT(*) as total_active FROM plus_subscriptions WHERE is_active = true AND expires_at > now()
    `);
    console.log('\n=== Total active VIP subscriptions ===');
    console.log(allActive[0]);
    
    // Check the user's profile for any issues
    const { rows: profile } = await client.query(`
      SELECT id, username, vacation_mode, points_total 
      FROM profiles WHERE id = '6516fcdc-95f9-47db-8479-eef6a7d09898'
    `);
    console.log('\n=== User profile ===');
    console.log(JSON.stringify(profile[0], null, 2));
    
    // Check telegram link
    const { rows: tg } = await client.query(`
      SELECT telegram_id FROM telegram_links WHERE user_id = '6516fcdc-95f9-47db-8479-eef6a7d09898'
    `);
    console.log('\n=== Telegram link ===');
    console.log(tg[0] || 'NO TELEGRAM LINK');
    
    // Check telegram group membership
    const { rows: tgMember } = await client.query(`
      SELECT is_member FROM telegram_task_rewards 
      WHERE user_id = '6516fcdc-95f9-47db-8479-eef6a7d09898' AND task_type = 'join_group'
    `);
    console.log('\n=== Telegram group membership ===');
    console.log(tgMember[0] || 'NO MEMBERSHIP RECORD');
    
    client.release();
    await pool.end();
  } catch (e) {
    console.error('Error:', e.message);
    await pool.end();
  }
})();
