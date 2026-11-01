const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const before = await c.query(`SELECT username, email, usdt_balance FROM profiles WHERE id='50da268b-d729-4f06-b8af-e03aa0437c1f'`);
  console.log('ANTES:', before.rows[0]);
  const r = await c.query(`UPDATE profiles SET usdt_balance=0 WHERE id='50da268b-d729-4f06-b8af-e03aa0437c1f' AND usdt_balance=200 RETURNING username, usdt_balance`);
  console.log('UPDATE:', r.rows);

  const total = await c.query(`SELECT SUM(fxu_balance)::numeric(20,4) AS fxu, SUM(usdt_balance)::numeric(20,4) AS usdt FROM profiles WHERE COALESCE(is_admin,false)=false`);
  console.log('DEUDA TOTAL (excl admin):', total.rows[0]);
  await c.end();
})();
