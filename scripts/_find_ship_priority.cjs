const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const src = r.rows[0].prosrc;
  // find Phase F or ship-build logic: look for 'military' role ships
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/ship_priority|v_ship_priority|military.*cargo|small_cargo.*military|military.*ship/i.test(l)) {
      console.log(i, ':', l.trim().substring(0, 220));
    }
  });
  console.log('---');
  // find the big role-based priority block (miner / military / research / colonizer)
  const idx = src.indexOf("WHEN 'military'");
  console.log('idx military:', idx);
  if (idx > 0) console.log(src.substring(idx - 200, idx + 2500));
  await c.end();
})();
