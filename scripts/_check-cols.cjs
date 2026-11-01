const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const r = await client.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name='planets' AND table_schema='public'
      AND column_name IN ('is_main_planet','is_main','is_home_planet','created_at','autopilot_role')
  `);
  console.log('Columnas planets relevantes:', r.rows.map(x=>x.column_name));
  await client.end();
})();
