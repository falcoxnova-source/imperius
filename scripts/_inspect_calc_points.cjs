const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='calculate_building_points'`);
  r.rows.forEach(x => console.log(x.def, '\n\n=========\n\n'));
  await c.end();
})();
