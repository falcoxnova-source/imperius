const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  for (const fn of ['admin_distribute_monthly_pool','admin_distribute_destruction_pool','admin_distribute_social_ranking_pool']) {
    const r = await c.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`, [fn]);
    console.log(`\n======== ${fn} ========`);
    console.log(r.rows[0]?.def || 'NOT FOUND');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
