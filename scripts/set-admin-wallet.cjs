const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

  // Current wallet
  console.log('=== Admin wallet ===');
  const w = await c.query('SELECT fxu_balance, usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log(`  FXU: ${w.rows[0].fxu_balance}`);
  console.log(`  USDT: ${w.rows[0].usdt_balance}`);

  // Check revenue table
  console.log('\n=== Revenue / income tables ===');
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%revenue%' OR table_name ILIKE '%income%' OR table_name ILIKE '%earning%' OR table_name ILIKE '%fee%' OR table_name ILIKE '%snapshot%') ORDER BY table_name");
  console.log(tables.rows.map(r => r.table_name).join(', '));

  // Check if there's a weekly snapshot or revenue log
  const tables2 = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%weekly%' OR table_name ILIKE '%histor%') ORDER BY table_name");
  console.log('Weekly/history tables:', tables2.rows.map(r => r.table_name).join(', '));

  // The 185,676.08 is the weekly revenue total. User wants admin fxu_balance = 185676.08
  // Let's just set it
  const targetFXU = 185676.08;
  const diff = targetFXU - parseFloat(w.rows[0].fxu_balance);
  console.log(`\n=== Plan ===`);
  console.log(`  Current FXU: ${w.rows[0].fxu_balance}`);
  console.log(`  Target FXU: ${targetFXU}`);
  console.log(`  Difference: ${diff}`);

  // Set admin fxu_balance to 185676.08
  await c.query('UPDATE profiles SET fxu_balance = $1 WHERE id = $2', [targetFXU, adminId]);
  
  // Verify
  const after = await c.query('SELECT fxu_balance, usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log(`\n=== After update ===`);
  console.log(`  FXU: ${after.rows[0].fxu_balance}`);
  console.log(`  USDT: ${after.rows[0].usdt_balance}`);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
