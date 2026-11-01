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
  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';

  // Balance antes
  const before = await c.query('SELECT usdt_balance FROM profiles WHERE id = $1', [adminId]);
  console.log('Balance ANTES: $' + parseFloat(before.rows[0].usdt_balance).toFixed(4));

  // Agregar $10
  const r = await c.query(
    'UPDATE profiles SET usdt_balance = usdt_balance + 10 WHERE id = $1 RETURNING usdt_balance',
    [adminId]
  );
  console.log('Balance DESPUES: $' + parseFloat(r.rows[0].usdt_balance).toFixed(4));
  console.log('+$10.00 acreditados al admin');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
