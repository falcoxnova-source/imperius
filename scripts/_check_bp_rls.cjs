const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  for (const t of ['ship_blueprints', 'user_ship_blueprints']) {
    const rls = await c.query(`SELECT relrowsecurity FROM pg_class WHERE oid='public.${t}'::regclass`);
    const pol = await c.query(`SELECT polname, polcmd, polroles::regrole[] AS roles, pg_get_expr(polqual, polrelid) AS using_expr FROM pg_policy WHERE polrelid='public.${t}'::regclass`);
    console.log(`\n== ${t} (RLS=${rls.rows[0].relrowsecurity}) ==`);
    console.table(pol.rows);
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
