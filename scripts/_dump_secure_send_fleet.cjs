const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_send_fleet'`);
  for (const row of r.rows) {
    console.log('--- DEFINITION ---');
    console.log(row.def);
    console.log('===');
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
