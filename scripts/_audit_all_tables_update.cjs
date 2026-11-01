const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });

(async () => {
  await c.connect();

  // 1) Listar todas las tablas public con RLS habilitado o no
  const tables = await c.query(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.relname`);

  console.log('=== TABLAS CON GRANT UPDATE A authenticated/anon ===\n');
  for (const t of tables.rows) {
    const g = await c.query(`
      SELECT DISTINCT grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema='public' AND table_name=$1
        AND grantee IN ('authenticated','anon')
        AND privilege_type='UPDATE'`, [t.table_name]);
    if (g.rows.length === 0) continue;

    // Policies de UPDATE
    const pol = await c.query(`
      SELECT policyname, cmd, qual, with_check, roles
      FROM pg_policies
      WHERE schemaname='public' AND tablename=$1 AND cmd IN ('UPDATE','ALL')`, [t.table_name]);

    // Triggers BEFORE UPDATE que puedan proteger
    const trg = await c.query(`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid=('public.'||$1)::regclass
        AND NOT tgisinternal
        AND (tgtype & 2) != 0  -- BEFORE
        AND (tgtype & 16) != 0 -- UPDATE
      `, [t.table_name]);

    const grantees = g.rows.map(r => r.grantee).join(',');
    const polSummary = pol.rows.length === 0 ? 'NO POLICIES' : pol.rows.map(p => `${p.policyname}[${p.cmd}]`).join('; ');
    const trgNames = trg.rows.map(r => r.tgname).join(', ') || '∅';

    console.log(`📋 ${t.table_name}  rls=${t.rls_enabled}  grantees=${grantees}`);
    console.log(`   policies: ${polSummary}`);
    console.log(`   triggers BEFORE UPDATE: ${trgNames}`);
    console.log();
  }

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
