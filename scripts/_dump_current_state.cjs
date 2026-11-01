const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const src = r.rows[0].prosrc;
  const lines = src.split('\n');
  // Find the small_cargo and large_cargo build blocks plus Phase H miner active_fleets line
  for (let i = 1240; i <= 1290; i++) console.log(i, (lines[i] || '').replace(/\r$/, '').substring(0, 200));
  console.log('---');
  // Find 'v_origin_active_fleets < 3' in miner
  lines.forEach((l, i) => {
    if (l.includes('v_origin_active_fleets')) console.log(i, ':', l.replace(/\r$/, '').substring(0, 220));
  });
  await c.end();
})();
