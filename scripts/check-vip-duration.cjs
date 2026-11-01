const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});

async function run() {
  await c.connect();
  
  // Check the live purchase_plus_subscription function for duration logic
  const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'`);
  const src = res.rows[0].prosrc;
  const lines = src.split('\n');
  
  // Find duration-related lines
  console.log('=== Duration-related lines in purchase_plus_subscription ===');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('duration') || line.includes('expires') || line.includes('interval') || line.includes('days') || line.includes('month')) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length, i + 3);
      console.log(`\n--- Line ${i+1} ---`);
      for (let j = start; j < end; j++) {
        console.log(`${j+1}: ${lines[j]}`);
      }
    }
  }
  
  // Also check the plus_plans table
  const plans = await c.query(`SELECT * FROM plus_plans ORDER BY price_usdt`);
  console.log('\n\n=== plus_plans table ===');
  plans.rows.forEach(p => console.log(p));
  
  // Check current VIP subscriptions and their expiry
  const subs = await c.query(`
    SELECT ps.*, pr.username, pp.code, pp.name as plan_name,
      ps.expires_at,
      ps.expires_at - NOW() as time_remaining
    FROM plus_subscriptions ps
    JOIN profiles pr ON pr.id = ps.user_id
    JOIN plus_plans pp ON pp.id = ps.plan_id
    WHERE ps.is_active = true
    ORDER BY ps.expires_at ASC
    LIMIT 10
  `);
  console.log('\n\n=== Active VIP subscriptions (soonest expiry first) ===');
  subs.rows.forEach(s => {
    console.log(`${s.username} | Plan: ${s.plan_name} (${s.code}) | Expires: ${s.expires_at} | Remaining: ${s.time_remaining}`);
  });
  
  await c.end();
}
run().catch(e => { console.error(e); process.exit(1); });
