const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='plus_subscriptions_payment_type_check'`);
  console.log(r.rows);
  await c.end();
})();
