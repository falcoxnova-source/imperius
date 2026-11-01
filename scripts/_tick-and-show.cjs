const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();

  // 1. Ejecutar tick
  const res = await client.query(`SELECT bot_ai_tick()`);
  console.log('Tick:', JSON.stringify(res.rows[0].bot_ai_tick));

  // 2. Cola por planeta de dark
  const r = await client.query(`
    SELECT p.name, p.is_main_planet,
           COUNT(bq.id) AS queued,
           ARRAY_AGG(bt.code || ' L' || bq.target_level ORDER BY bq.queue_position) AS items
    FROM planets p
    LEFT JOIN building_queue bq ON bq.planet_id=p.id
    LEFT JOIN building_types bt ON bt.id=bq.building_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com')
      AND NOT p.is_destroyed
    GROUP BY p.id, p.name, p.is_main_planet, p.created_at
    ORDER BY p.is_main_planet DESC, p.created_at
  `);
  console.log('\n=== Colas tras tick (dark tiene commander → max 5) ===');
  r.rows.forEach(x => {
    const tag = x.is_main_planet?'🌍':'🛰️ ';
    console.log(`${tag} ${x.name.padEnd(22)} ${x.queued}/5  [${x.items.filter(i=>i).join(', ')}]`);
  });

  await client.end();
})();
