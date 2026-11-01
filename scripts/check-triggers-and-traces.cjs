const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // Check triggers on admin_revenue
  console.log('=== TRIGGERS en admin_revenue ===');
  const t1 = await c.query(`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'admin_revenue'
  `);
  for (const r of t1.rows) {
    console.log(`  ${r.trigger_name}: ${r.event_manipulation} → ${r.action_statement}`);
  }
  if (t1.rows.length === 0) console.log('  (ninguno)');

  // Check triggers on plus_subscriptions
  console.log('\n=== TRIGGERS en plus_subscriptions ===');
  const t2 = await c.query(`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'plus_subscriptions'
  `);
  for (const r of t2.rows) {
    console.log(`  ${r.trigger_name}: ${r.event_manipulation} → ${r.action_statement}`);
  }
  if (t2.rows.length === 0) console.log('  (ninguno)');

  // Check triggers on profiles
  console.log('\n=== TRIGGERS en profiles ===');
  const t3 = await c.query(`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'profiles'
  `);
  for (const r of t3.rows) {
    console.log(`  ${r.trigger_name}: ${r.event_manipulation} → ${r.action_statement}`);
  }
  if (t3.rows.length === 0) console.log('  (ninguno)');

  // Now: the KEY question - is the $60 really in admin or not?
  // Let's check admin balance BEFORE any Plus USDT purchases started (March 31)
  // and trace each change
  console.log('\n=== TODAS las compras Plus USDT con timestamps ===');
  const plus = await c.query(`
    SELECT ps.id, ps.user_id, p.username, ps.payment_type, ps.amount_paid, ps.created_at
    FROM plus_subscriptions ps
    JOIN profiles p ON p.id = ps.user_id
    WHERE ps.payment_type = 'usdt'
    ORDER BY ps.created_at ASC
  `);
  for (const r of plus.rows) {
    console.log(`  ${r.created_at} - ${r.username}: $${r.amount_paid}`);
  }

  // Check wallet_transactions for admin to see if there were manual credits
  console.log('\n=== wallet_transactions del admin desde Marzo 25 ===');
  const wt = await c.query(`
    SELECT id, tx_type, amount, status, created_at, tx_hash
    FROM wallet_transactions
    WHERE user_id = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'
      AND created_at >= '2026-03-25'
    ORDER BY created_at ASC
  `);
  for (const r of wt.rows) {
    console.log(`  ${r.created_at} - ${r.tx_type}: $${r.amount} (${r.status})`);
  }
  if (wt.rows.length === 0) console.log('  (ninguna)');

  // Check if there are ANY other functions that credit admin usdt_balance
  console.log('\n=== FUNCIONES que actualizan usdt_balance del admin ===');
  const funcs = await c.query(`
    SELECT proname FROM pg_proc
    WHERE prosrc ILIKE '%usdt_balance%'
      AND prosrc ILIKE '%admin%'
    ORDER BY proname
  `);
  for (const r of funcs.rows) {
    console.log(`  - ${r.proname}`);
  }

  // Check if admin got USDT from swaps during the same timeframe
  console.log('\n=== Admin revenue USDT (Plus) por semana ===');
  const ar = await c.query(`
    SELECT amount, description, related_user_id, created_at 
    FROM admin_revenue 
    WHERE revenue_type = 'plus_subscription'
      AND description LIKE '%(USDT)%'
    ORDER BY created_at ASC
  `);
  for (const r of ar.rows) {
    console.log(`  ${r.created_at}: $${r.amount} - ${r.description}`);
  }
  console.log(`  Total USDT Plus revenue records: $${ar.rows.reduce((s,r) => s + parseFloat(r.amount), 0).toFixed(2)}`);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
