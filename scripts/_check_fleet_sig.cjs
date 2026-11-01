const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  // Check secure_send_fleet signature
  const r = await c.query(`
    SELECT pg_get_function_arguments(oid) AS args
    FROM pg_proc WHERE proname = 'secure_send_fleet'
  `);
  console.log('secure_send_fleet args:', r.rows);
  await c.end();
})();
