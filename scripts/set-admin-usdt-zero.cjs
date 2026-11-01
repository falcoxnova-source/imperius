const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

  await c.query('ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger');
  await c.query('UPDATE profiles SET usdt_balance = 0 WHERE id = $1', [adminId]);
  await c.query('ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger');

  const r = await c.query('SELECT fxu_balance, usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log('Admin:', r.rows[0]);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
