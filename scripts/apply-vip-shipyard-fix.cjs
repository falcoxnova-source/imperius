const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const sql = fs.readFileSync('supabase/migrations/20260410100000_fix_shipyard_vip_bonus.sql', 'utf-8');
  
  console.log('Executing migration: 20260410100000_fix_shipyard_vip_bonus.sql');
  await c.query(sql);
  
  // Verify the patch was applied
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_add_to_shipyard_queue' AND pronamespace='public'::regnamespace");
  const src = r.rows[0]?.prosrc || '';
  const hasVIP = src.includes('VIP Plus: -10% shipyard construction time');
  console.log('VIP bonus present in secure_add_to_shipyard_queue:', hasVIP);
  
  if (!hasVIP) {
    console.error('ERROR: VIP bonus was NOT applied!');
    process.exit(1);
  }
  
  console.log('Migration applied successfully!');
  
  // Final verification: check ALL functions again
  const funcs = [
    'calculate_planet_resources',
    'secure_add_to_building_queue',
    'secure_add_to_shipyard_queue',
    'secure_start_research',
    'secure_send_fleet',
    'join_acs_with_fleet'
  ];
  
  console.log('\n=== Final VIP Bonus Status ===');
  for (const fname of funcs) {
    const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname=$1 AND pronamespace='public'::regnamespace", [fname]);
    const src2 = r2.rows[0]?.prosrc || '';
    const hasVip = src2.includes('is_user_plus') || src2.includes('VIP Plus');
    console.log(`  ${fname}: ${hasVip ? '✅ VIP bonus present' : '❌ MISSING'}`);
  }
  
  await c.end();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
