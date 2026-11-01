const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='game_settings'`);
  console.log('game_settings cols:', r.rows);
  const sample = await c.query(`SELECT * FROM game_settings WHERE key ILIKE '%fee%' OR key ILIKE '%pct%' OR key ILIKE '%pool%' LIMIT 5`);
  console.log('sample:', sample.rows);
  await c.end();
})().catch(e => console.error(e.message));
