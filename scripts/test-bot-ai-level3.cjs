const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  const r = await c.query('SELECT bot_ai_tick() as result');
  console.log('BOT_AI_TICK_RESULT');
  console.log(JSON.stringify(r.rows[0].result, null, 2));

  const fleets = await c.query(`
    SELECT p.username, f.mission_type, f.target_galaxy, f.target_system, f.target_position, f.is_completed
    FROM fleets f
    JOIN profiles p ON p.id = f.user_id
    WHERE p.is_bot = true
    ORDER BY f.created_at DESC
    LIMIT 10
  `);

  console.log('RECENT_BOT_FLEETS');
  fleets.rows.forEach(x => console.log(JSON.stringify(x)));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
