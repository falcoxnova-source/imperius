const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function audit() {
  await c.connect();

  // 1. Admin profile - what is the admin's actual balance?
  console.log('=== ADMIN PROFILE(S) ===');
  const admin = await c.query(`
    SELECT id, username, email, fxu_balance, usdt_balance, is_admin
    FROM profiles WHERE is_admin = true
  `);
  console.table(admin.rows);

  // 2. Find the function that handles building instant complete (to see if FXU goes to admin)
  console.log('\n=== INSTANT BUILD FUNCTION ===');
  const ibFunc = await c.query(`
    SELECT proname, LEFT(prosrc, 3000) as src
    FROM pg_proc WHERE proname LIKE '%instant%build%' OR proname LIKE '%instant_complete%'
    LIMIT 3
  `);
  ibFunc.rows.forEach(f => {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.src);
  });

  // 3. Find swap function
  console.log('\n=== SWAP FUNCTION ===');
  const swapFunc = await c.query(`
    SELECT proname, LEFT(prosrc, 3000) as src
    FROM pg_proc WHERE proname LIKE '%swap%fxu%' OR proname LIKE '%swap%usdt%' OR proname LIKE '%perform_swap%'
    LIMIT 3
  `);
  swapFunc.rows.forEach(f => {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.src);
  });

  // 4. Check accelerate fleet function
  console.log('\n=== FLEET ACCELERATION FUNCTION ===');
  const accelFunc = await c.query(`
    SELECT proname, LEFT(prosrc, 2000) as src
    FROM pg_proc WHERE proname LIKE '%accel%fleet%' OR proname LIKE '%fleet%accel%'
    LIMIT 3
  `);
  accelFunc.rows.forEach(f => {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.src);
  });

  // 5. Check the withdrawal function more completely
  console.log('\n=== REQUEST WITHDRAWAL USDT (full) ===');
  const wdFunc = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'request_withdrawal_usdt'
  `);
  if (wdFunc.rows[0]) {
    console.log(wdFunc.rows[0].prosrc);
  }

  // 6. Admin balance changes over time - check if admin gets credited
  console.log('\n=== ADMIN BALANCE TRACKING ===');
  const adminId = admin.rows[0]?.id;
  if (adminId) {
    // Check recent changes to admin's FXU balance
    console.log(`Admin ID: ${adminId}, FXU: ${admin.rows[0].fxu_balance}, USDT: ${admin.rows[0].usdt_balance}`);
  }

  await c.end();
}

audit().catch(e => { console.error(e); process.exit(1); });
