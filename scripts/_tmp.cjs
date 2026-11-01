const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check what these admin functions do
  for (const fn of ['admin_get_planet_inventory', 'admin_set_planet_building', 'admin_set_planet_ship']) {
    const r = await c.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND proname=$1`, [fn]);
    console.log('---', fn, '---');
    console.log(r.rows[0]?.def || 'NOT FOUND');
    console.log();
  }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
