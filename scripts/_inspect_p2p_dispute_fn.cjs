const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(
    "SELECT proname, pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname IN ('p2p_open_dispute','p2p_accept_offer') ORDER BY proname"
  );
  for (const row of r.rows) {
    console.log('=====', row.proname, '=====');
    console.log(row.def);
    console.log('');
  }
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
