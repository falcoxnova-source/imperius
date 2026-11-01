const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS d FROM pg_proc WHERE proname='calculate_building_total_cost'`);
  r.rows.forEach(x => console.log(x.d));
  console.log('\n--- base costs ---');
  const bt = await c.query(`SELECT code,base_metal,base_crystal,base_deuterium,cost_factor FROM building_types ORDER BY code`);
  console.table(bt.rows);
  await c.end();
})();
