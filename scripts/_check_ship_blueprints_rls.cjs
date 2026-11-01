const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT polname, polcmd,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS withcheck_expr
    FROM pg_policy
    WHERE polrelid = 'public.ship_blueprints'::regclass
  `);
  console.table(r.rows);

  const rls = await c.query(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ship_blueprints'::regclass`);
  console.log('RLS enabled:', rls.rows[0]?.relrowsecurity);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
