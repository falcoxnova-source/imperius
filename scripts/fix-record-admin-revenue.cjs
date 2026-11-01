const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1) Show all overloads of record_admin_revenue
  console.log('=== record_admin_revenue overloads ===');
  const r1 = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args, p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'record_admin_revenue'
  `);
  console.log(r1.rows);

  // 2) Find what's calling it with 5 params (likely marketplace)
  console.log('\n=== Functions referencing record_admin_revenue ===');
  const r2 = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%record_admin_revenue%'
      AND p.proname != 'record_admin_revenue'
  `);
  console.log(r2.rows);

  // 3) Drop old 5-param version (without p_currency)
  console.log('\n=== Dropping old 5-param overload ===');
  try {
    await c.query(`
      DROP FUNCTION IF EXISTS public.record_admin_revenue(text, numeric, text, uuid, uuid);
    `);
    console.log('SUCCESS: Old 5-param overload dropped');
  } catch (e) {
    console.error('Error dropping:', e.message);
  }

  // 4) Verify only new version remains
  console.log('\n=== Remaining overloads ===');
  const r3 = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'record_admin_revenue'
  `);
  console.log(r3.rows);

  // 5) Quick test: can we call with 5 params now?
  console.log('\n=== Test: calling with 5 params (should resolve to 6-param with default) ===');
  try {
    const r4 = await c.query(`
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'record_admin_revenue'
    `);
    console.log('Function definition confirms 6 params with DEFAULT');
  } catch (e) {
    console.error('Error:', e.message);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
