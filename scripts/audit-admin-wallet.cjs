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
  console.log('=== AUDIT: ¿El dinero llega al admin? ===\n');

  // 1. Get admin user
  const adminRes = await client.query(`
    SELECT id, username, fxu_balance FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1
  `);
  const admin = adminRes.rows[0];
  console.log(`Admin: ${admin.username} | Balance actual: ${parseFloat(admin.fxu_balance).toFixed(2)} FXU\n`);

  // 2. Get the accelerate_fleet function source to see if it credits admin
  const funcRes = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet'
  `);
  if (funcRes.rows.length > 0) {
    const src = funcRes.rows[0].prosrc;
    console.log('=== accelerate_fleet function analysis ===');
    console.log('Contains record_admin_revenue?', src.includes('record_admin_revenue'));
    console.log('Contains fxu_balance + ?', src.includes('fxu_balance') && src.includes('admin'));
    console.log('Contains _internal_set_fxu_context?', src.includes('_internal_set_fxu_context'));
    
    // Show the relevant money-handling parts
    const lines = src.split('\n');
    console.log('\n--- Money-related lines in accelerate_fleet ---');
    lines.forEach((line, i) => {
      if (line.match(/fxu_balance|admin|record_admin|_internal_set_fxu|contribute_to_jackpot|UPDATE.*profiles/i)) {
        console.log(`  L${i}: ${line.trim()}`);
      }
    });
  } else {
    console.log('❌ accelerate_fleet function NOT FOUND');
  }

  // 3. Check recent fleet_acceleration entries in admin_revenue
  console.log('\n=== Recent fleet_acceleration in admin_revenue (last 10) ===');
  const recentAccel = await client.query(`
    SELECT ar.id, ar.amount, ar.description, ar.related_user_id, ar.created_at,
           p.username
    FROM admin_revenue ar
    LEFT JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type = 'fleet_acceleration'
    ORDER BY ar.created_at DESC
    LIMIT 10
  `);
  recentAccel.rows.forEach(r => {
    console.log(`  ${r.username}: ${parseFloat(r.amount).toFixed(2)} FXU | ${r.description} | ${r.created_at}`);
  });

  // 4. Compare: admin_revenue total vs what should have been credited to admin fxu_balance
  console.log('\n=== TOTAL admin_revenue by type (all time) ===');
  const totalByType = await client.query(`
    SELECT revenue_type, COUNT(*) as cnt, SUM(amount) as total
    FROM admin_revenue
    GROUP BY revenue_type
    ORDER BY total DESC
  `);
  let grandTotal = 0;
  totalByType.rows.forEach(r => {
    const t = parseFloat(r.total);
    grandTotal += t;
    console.log(`  ${r.revenue_type}: ${r.cnt} ops, ${t.toFixed(2)} FXU`);
  });
  console.log(`  GRAND TOTAL admin_revenue: ${grandTotal.toFixed(2)} FXU`);

  // 5. Check: Does accelerate_fleet UPDATE admin fxu_balance or just record_admin_revenue?
  console.log('\n=== CRITICAL: Does accelerate_fleet credit admin wallet? ===');
  const funcSrc = funcRes.rows[0]?.prosrc || '';
  
  // Check if it does UPDATE profiles SET fxu_balance for admin
  const updatesAdminBalance = funcSrc.match(/UPDATE\s+profiles\s+SET\s+fxu_balance\s*=\s*fxu_balance\s*\+.*admin/is);
  console.log('Updates admin fxu_balance directly?', !!updatesAdminBalance);
  
  // Check record_admin_revenue function - does IT update admin balance?
  const recordFunc = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'record_admin_revenue'
  `);
  if (recordFunc.rows.length > 0) {
    const recordSrc = recordFunc.rows[0].prosrc;
    console.log('\n=== record_admin_revenue function analysis ===');
    console.log('Full source:');
    console.log(recordSrc);
  }

  // 6. Check other functions that handle payments - instant_build, instant_research, etc.
  console.log('\n=== Checking ALL payment functions for admin wallet credit ===');
  const paymentFuncs = [
    'accelerate_fleet',
    'purchase_plus_subscription', 
    'purchase_officer_fxu',
    'instant_complete_building',
    'instant_complete_research',
    'instant_complete_ship',
    'purchase_supply_box',
    'purchase_supply_box_v2'
  ];

  for (const fname of paymentFuncs) {
    const res = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fname]);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      const hasAdminUpdate = src.includes('fxu_balance + ') || src.includes('fxu_balance +');
      const hasRecordRevenue = src.includes('record_admin_revenue');
      const hasSetFxuCtx = src.includes('_internal_set_fxu_context');
      const hasJackpot = src.includes('contribute_to_jackpot');
      
      // Find the line where admin balance is updated
      const adminBalanceUpdate = src.match(/UPDATE\s+profiles\s+SET\s+fxu_balance\s*=\s*fxu_balance\s*\+/gi);
      
      console.log(`\n  ${fname}:`);
      console.log(`    Updates admin fxu_balance: ${!!adminBalanceUpdate} (${adminBalanceUpdate?.length || 0} times)`);
      console.log(`    Calls record_admin_revenue: ${hasRecordRevenue}`);
      console.log(`    Calls _internal_set_fxu_context: ${hasSetFxuCtx}`);
      console.log(`    Calls contribute_to_jackpot: ${hasJackpot}`);
      
      if (!adminBalanceUpdate && hasRecordRevenue) {
        console.log(`    ⚠️ WARNING: Records revenue but may NOT credit admin wallet!`);
      }
      if (!hasSetFxuCtx && (adminBalanceUpdate || hasRecordRevenue)) {
        console.log(`    ⚠️ WARNING: No _internal_set_fxu_context - may fail due to protect trigger!`);
      }
    } else {
      console.log(`\n  ${fname}: NOT FOUND`);
    }
  }

  // 7. Specific audit: Luciffer Walker recent accelerations
  console.log('\n=== Luciffer Walker audit ===');
  const luciffer = await client.query(`
    SELECT id, username, fxu_balance FROM profiles WHERE username ILIKE '%luciffer%' OR username ILIKE '%walker%'
  `);
  if (luciffer.rows.length > 0) {
    const user = luciffer.rows[0];
    console.log(`User: ${user.username} | Balance: ${parseFloat(user.fxu_balance).toFixed(2)} FXU`);
    
    // Check recent fleet accelerations for this user
    const accelRevenue = await client.query(`
      SELECT SUM(amount) as total, COUNT(*) as cnt
      FROM admin_revenue 
      WHERE related_user_id = $1 AND revenue_type = 'fleet_acceleration'
    `, [user.id]);
    console.log(`Fleet accel in admin_revenue: ${accelRevenue.rows[0].cnt} ops, ${parseFloat(accelRevenue.rows[0].total || 0).toFixed(2)} FXU`);
  }

  await client.end();
  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(e => { console.error(e); process.exit(1); });
