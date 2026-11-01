const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(p.oid) AS src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_and_setup_admin'`);
  console.log(r.rows[0]?.src);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
