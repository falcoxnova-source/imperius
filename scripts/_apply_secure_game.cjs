const fs = require('fs');
const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260508_secure_game_tables.sql', 'utf8');
  await c.query(sql);
  console.log('✅ Migración aplicada');

  const r = await c.query(`
    SELECT tgname, c.relname
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE NOT t.tgisinternal
      AND t.tgname LIKE 'protect_%'
    ORDER BY c.relname, tgname`);
  console.log('\nTriggers defensivos activos:');
  r.rows.forEach(x => console.log(`  [${x.relname}] ${x.tgname}`));
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
