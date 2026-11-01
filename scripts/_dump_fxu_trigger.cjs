const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='protect_fxu_balance'`);
  console.log(r.rows[0]?.def || 'NOT FOUND');
  console.log('\n--- Triggers on profiles ---');
  const t = await c.query(`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
    WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal ORDER BY tgname`);
  t.rows.forEach(x => console.log(x.def));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
