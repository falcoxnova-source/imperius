const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';
  const targetFXU = 185676.08;

  // Get current balance
  const before = await c.query('SELECT fxu_balance, usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log('Before:', before.rows[0].fxu_balance, 'FXU');

  // Disable the trigger, update, re-enable
  await c.query('ALTER TABLE profiles DISABLE TRIGGER ALL');
  await c.query('UPDATE profiles SET fxu_balance = $1 WHERE id = $2', [targetFXU, adminId]);
  await c.query('ALTER TABLE profiles ENABLE TRIGGER ALL');

  // Verify
  const after = await c.query('SELECT fxu_balance, usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log('After:', after.rows[0].fxu_balance, 'FXU');
  console.log('USDT unchanged:', after.rows[0].usdt_balance);

  console.log('\n✅ Admin wallet set to 185,676.08 FXU');

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
