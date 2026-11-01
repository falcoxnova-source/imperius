const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Find user by email
  const user = await c.query(`
    SELECT p.id, p.username, p.fxu_balance, p.usdt_balance, au.email
    FROM profiles p
    JOIN auth.users au ON au.id = p.id
    WHERE au.email = 'ellachy8926@gmail.com'
  `);

  if (!user.rows.length) {
    console.log('❌ User not found with that email');
    await c.end();
    return;
  }

  const u = user.rows[0];
  console.log(`User: ${u.username} (${u.id})`);
  console.log(`Before: FXU=${u.fxu_balance}, USDT=${u.usdt_balance}`);

  await c.query('ALTER TABLE profiles DISABLE TRIGGER protect_fxu_balance_trigger');
  await c.query('UPDATE profiles SET usdt_balance = 11 WHERE id = $1', [u.id]);
  await c.query('ALTER TABLE profiles ENABLE TRIGGER protect_fxu_balance_trigger');

  const after = await c.query('SELECT usdt_balance FROM profiles WHERE id = $1', [u.id]);
  console.log(`After: USDT=${after.rows[0].usdt_balance}`);
  console.log('✅ Done');

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
