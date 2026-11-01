const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='admin_revenue'::regclass AND contype='c'"
  );
  console.log('admin_revenue checks:', r.rows);
  const r2 = await c.query(
    "SELECT proname, pg_get_function_arguments(oid) AS args FROM pg_proc WHERE proname IN ('contribute_to_jackpot','record_admin_revenue')"
  );
  console.log('functions:', r2.rows);
  await c.end();
})();
