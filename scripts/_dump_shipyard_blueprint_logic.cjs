const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  for (const fn of ['secure_add_to_shipyard_queue', 'enforce_ship_blueprint_requirement']) {
    const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = $1`, [fn]);
    console.log('================ ' + fn + ' ================');
    console.log(r.rows[0]?.def?.slice(0, 4500) || '(no encontrada)');
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
