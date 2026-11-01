const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const sep = (t) => console.log('\n===== ' + t + ' =====');

  sep('RLS habilitado en tablas críticas');
  const rls = await c.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_on, c.relforcerowsecurity AS rls_forced
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND c.relname IN ('profiles','p2p_offers','p2p_orders','p2p_messages','p2p_disputes','p2p_reputation','p2p_ratings','p2p_payment_methods','p2p_audit_log','game_settings','referral_commissions')
    ORDER BY c.relname`);
  rls.rows.forEach(r => console.log(`${r.rls_on?'✅':'❌'} ${r.table_name}  forced=${r.rls_forced}`));

  sep('Políticas RLS sobre profiles (balances)');
  const pol = await c.query(`
    SELECT polname, polcmd,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS check_expr
    FROM pg_policy WHERE polrelid='public.profiles'::regclass ORDER BY polname`);
  pol.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  sep('Triggers/protecciones sobre profiles.fxu_balance/usdt_balance');
  const pt = await c.query(`
    SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal`);
  pt.rows.forEach(r => console.log(`- ${r.tgname}`));

  sep('¿El rol anon/authenticated puede UPDATE profiles directo?');
  const gr = await c.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name='profiles' AND grantee IN ('anon','authenticated','service_role')
    ORDER BY grantee, privilege_type`);
  gr.rows.forEach(r => console.log(`- ${r.grantee}: ${r.privilege_type}`));

  sep('Funciones SECURITY DEFINER relacionadas a balance');
  const sd = await c.query(`
    SELECT p.proname, p.prosecdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND (p.proname LIKE 'p2p_%' OR p.proname LIKE '%balance%' OR p.proname LIKE '%transfer%' OR p.proname LIKE '%deposit%' OR p.proname LIKE '%withdraw%')
    ORDER BY p.proname`);
  sd.rows.forEach(r => console.log(`- ${r.proname} (SECURITY DEFINER)`));

  sep('Guardia fxu.allow_update_9x7k2m (si existe)');
  const guard = await c.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid='public.profiles'::regclass
      AND NOT tgisinternal
      AND tgname ILIKE '%balance%' OR tgname ILIKE '%fxu%' OR tgname ILIKE '%guard%'`);
  guard.rows.forEach(r => console.log(`- ${r.tgname}`));

  sep('game_settings: políticas (solo admin debería escribir)');
  const gs = await c.query(`
    SELECT polname, polcmd,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS check_expr
    FROM pg_policy WHERE polrelid='public.game_settings'::regclass ORDER BY polname`);
  gs.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  sep('p2p_offers políticas');
  const p1 = await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr FROM pg_policy WHERE polrelid='public.p2p_offers'::regclass ORDER BY polname`);
  p1.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  sep('p2p_orders políticas');
  const p2 = await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr FROM pg_policy WHERE polrelid='public.p2p_orders'::regclass ORDER BY polname`);
  p2.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  sep('p2p_reputation políticas (¿pueden auto-desbanearse?)');
  const p3 = await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr FROM pg_policy WHERE polrelid='public.p2p_reputation'::regclass ORDER BY polname`);
  p3.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  sep('p2p_audit_log políticas (¿se pueden borrar evidencias?)');
  const p4 = await c.query(`SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr FROM pg_policy WHERE polrelid='public.p2p_audit_log'::regclass ORDER BY polname`);
  p4.rows.forEach(r => console.log(`- ${r.polname} [${r.polcmd}]  USING=${r.using_expr}  CHECK=${r.check_expr}`));

  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
