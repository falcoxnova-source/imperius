const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'bot_ai_tick'`);
  const src = r.rows[0].def;
  console.log('Has deathstar in priority:', src.includes("'deathstar'"));
  console.log('Has falco_x in priority:', src.includes("'falco_x'"));
  console.log('Has nova in priority:', src.includes("'nova'"));
  console.log('Has SMART DEFENSE comment:', src.includes('SMART DEFENSE'));
  console.log('Has SMART FOCUS comment:', src.includes('SMART FOCUS'));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
