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

  for (const n of ['admin_telegram_config', 'telegram_dm_config']) {
    const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${n}' ORDER BY ordinal_position`);
    console.log(n, r.rows.map(x => x.column_name));
    const r2 = await c.query(`SELECT * FROM ${n} LIMIT 2`);
    // Mask potential secrets
    console.log(r2.rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, typeof v === 'string' && v.length > 30 ? v.slice(0,8)+'...'+v.slice(-4) : v]))));
  }

  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
