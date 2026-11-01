const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT id, username, email, is_admin, fxu_balance, usdt_balance FROM profiles WHERE is_admin=true ORDER BY created_at`);
  console.log('Admins:', r.rows);
  await c.end();
})();
