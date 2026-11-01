const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const email = 'falcoxcorp@gmail.com';
  const before = await c.query(
    'SELECT id, username, email, fxu_balance, usdt_balance FROM profiles WHERE email = $1',
    [email]
  );
  console.log('ANTES:');
  console.table(before.rows);

  if (before.rows.length === 0) {
    console.log('No se encontro el usuario con ese email.');
    await c.end();
    return;
  }

  const upd = await c.query(
    `UPDATE profiles
     SET usdt_balance = 22.30
     WHERE email = $1
     RETURNING id, username, email, fxu_balance, usdt_balance`,
    [email]
  );
  console.log('DESPUES:');
  console.table(upd.rows);

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
