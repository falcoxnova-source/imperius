const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r1 = await c.query(`SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgname='protect_fxu_balance_trigger'`);
  console.log('TRIGGER DEF:\n', r1.rows[0]?.def);

  const r2 = await c.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%protect_fxu%'`);
  r2.rows.forEach(r => {
    console.log('\n=== FUNCTION', r.proname, '===');
    console.log(r.src);
  });

  // Check p2p_audit_log policies
  const r3 = await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS u, pg_get_expr(polwithcheck, polrelid) AS ch FROM pg_policy WHERE polrelid='public.p2p_audit_log'::regclass`);
  console.log('\naudit_log policies:', r3.rows);

  // Check p2p_messages / p2p_disputes
  const r4 = await c.query(`SELECT c.relname AS t, p.polname, p.polcmd, pg_get_expr(p.polqual, p.polrelid) AS u, pg_get_expr(p.polwithcheck, p.polrelid) AS ch FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relname IN ('p2p_messages','p2p_disputes','p2p_ratings','p2p_payment_methods','referral_commissions') ORDER BY c.relname, p.polname`);
  console.log('\nother tables:');
  r4.rows.forEach(r => console.log(`[${r.t}] ${r.polname} ${r.polcmd}  U=${r.u}  CH=${r.ch}`));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
