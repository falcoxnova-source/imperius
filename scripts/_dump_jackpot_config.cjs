const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='jackpot_pools' ORDER BY ordinal_position`);
  console.log('jackpot_pools columns:');
  cols.rows.forEach(x => console.log('  -', x.column_name));

  const jc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='jackpot_config' ORDER BY ordinal_position`);
  console.log('\njackpot_config columns:');
  jc.rows.forEach(x => console.log('  -', x.column_name));

  const jcv = await c.query(`SELECT * FROM jackpot_config LIMIT 2`);
  console.log('\njackpot_config rows:');
  jcv.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  const jp = await c.query(`SELECT * FROM jackpot_pools LIMIT 2`);
  console.log('\njackpot_pools rows:');
  jp.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  // Dump admin_update_pool_percents
  const fn = await c.query(`SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='admin_update_pool_percents'`);
  console.log('\n\n=== admin_update_pool_percents ===\n');
  console.log(fn.rows[0]?.def || 'NOT FOUND');

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
