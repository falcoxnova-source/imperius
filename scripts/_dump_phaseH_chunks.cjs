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
  const idx = src.indexOf('Phase H');
  console.log('Phase H starts at index:', idx, 'total length:', src.length);
  // Look for end of phase H (start of Phase I, or end of function)
  const idxI = src.indexOf('Phase I', idx);
  const idxNext = src.indexOf('Phase ', idx + 10);
  console.log('Next Phase marker at:', idxNext, 'Phase I at:', idxI);
  // Print from Phase H to Phase I (or +12000 chars)
  const end = idxI > 0 ? idxI : idx + 15000;
  const chunk = src.substring(idx, end);
  console.log('=== PHASE H FULL (', chunk.length, 'chars) ===');
  console.log(chunk);
  await c.end();
})();
