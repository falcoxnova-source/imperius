const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();

  console.log('=== Funciones de protección ===');
  const fns = await c.query(`
    SELECT p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.proname ILIKE '%protect%' OR p.proname ILIKE '%guard%')
    ORDER BY p.proname`);
  fns.rows.forEach(r => console.log(`- ${r.proname}`));

  console.log('\n=== Todos los triggers en profiles ===');
  const tr = await c.query(`SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND NOT tgisinternal`);
  tr.rows.forEach(r => console.log(r.def));

  console.log('\n=== Columnas sensibles en profiles ===');
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name='profiles'
      AND column_name IN ('fxu_balance','usdt_balance','metal_balance','crystal_balance','deuterium_balance','is_admin','credits','dark_matter_balance')
    ORDER BY column_name`);
  cols.rows.forEach(r => console.log(`- ${r.column_name} (${r.data_type})`));

  // Test real: intentar update directo a usdt_balance con rol authenticated
  console.log('\n=== Test: simulación auth anónimo sobre usdt_balance ===');
  try {
    await c.query(`SET LOCAL ROLE authenticated`);
    await c.query(`SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'`);
    const t = await c.query(`EXPLAIN (COSTS OFF) UPDATE profiles SET usdt_balance = usdt_balance + 999 WHERE id = auth.uid()`);
    console.log('explain:', t.rows);
  } catch (e) {
    console.log('authenticated test falló:', e.message);
  }

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
