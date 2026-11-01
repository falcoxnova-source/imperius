const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE '%send_fleet%'`);
  console.log('send_fleet functions:', r.rows);
  const r2 = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE '%fleet%' AND proschema = 'public' OR proname LIKE '%fleet%'`);
  console.log('all fleet functions:', r2.rows.map(x => x.proname));
  await c.end();
})();
