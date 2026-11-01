const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Check what buildings bots are constructing
  const r = await c.query(`
    SELECT p.username, bt.code as building, bq.target_level, bq.end_time
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.is_bot = true
    ORDER BY p.username
  `);
  console.log('\n=== BOT BUILDING QUEUES ===');
  console.table(r.rows);

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
