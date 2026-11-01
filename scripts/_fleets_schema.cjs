const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='fleets' ORDER BY ordinal_position`);
  for (const row of r.rows) console.log(row.column_name, row.data_type);
  console.log('---fleet_ships?---');
  const r2 = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_name ILIKE '%fleet%'`);
  for (const row of r2.rows) console.log(row.table_name);
  await c.end();
})();
