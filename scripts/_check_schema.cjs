const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' ORDER BY ordinal_position`);
  console.log(r.rows.map(x => x.column_name));
  const r2 = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planets' ORDER BY ordinal_position`);
  console.log(r2.rows.map(x => x.column_name));
  await c.end();
})();
