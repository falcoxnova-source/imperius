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

  // Find NOVA user id
  const u = await c.query(`SELECT id FROM profiles WHERE email='samaileal01@gmail.com' LIMIT 1`);
  const uid = u.rows[0].id;
  console.log('NOVA user:', uid);

  const tick = await c.query(`SELECT bot_ai_tick() AS r`);
  console.log('tick result:', JSON.stringify(tick.rows[0].r));

  const ev = await c.query(
    `SELECT event_type, payload, created_at FROM autopilot_events
     WHERE user_id = $1 AND created_at > now() - interval '2 minutes'
     ORDER BY created_at DESC LIMIT 40`,
    [uid]
  );
  console.log('\n=== Recent events ===');
  for (const row of ev.rows) {
    console.log(row.created_at.toISOString(), row.event_type, JSON.stringify(row.payload));
  }
  await c.end();
})();
