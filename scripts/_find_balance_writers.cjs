const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  // Find all functions that update the sensitive columns, and check if they set the guard
  const cols = ['usdt_balance', 'dark_matter', 'is_admin', 'is_banned'];
  for (const col of cols) {
    console.log(`\n=== Functions that touch ${col} ===`);
    const r = await c.query(`
      SELECT p.proname, p.prosecdef,
             (pg_get_functiondef(p.oid) ~* $2) AS has_guard
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.prokind = 'f'
        AND pg_get_functiondef(p.oid) ~* $1
      ORDER BY p.proname`, [col, 'fxu\\.allow_update_9x7k2m']);
    r.rows.forEach(x => console.log(`  ${x.prosecdef ? 'SD' : '  '} ${x.has_guard ? 'G' : ' '} ${x.proname}`));
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
