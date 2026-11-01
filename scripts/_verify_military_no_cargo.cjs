const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const u = await c.query(`SELECT id FROM profiles WHERE email='samaileal01@gmail.com' LIMIT 1`);
  const uid = u.rows[0].id;

  // Find military planets of NOVA and their shipyard queues before
  const before = await c.query(`
    SELECT p.id, p.name, p.autopilot_role,
           (SELECT jsonb_agg(jsonb_build_object('code', st.code, 'qty', sq.quantity))
              FROM shipyard_queue sq JOIN ship_types st ON st.id = sq.ship_type_id
              WHERE sq.planet_id = p.id) AS queue
    FROM planets p
    WHERE p.user_id = $1 AND p.autopilot_role = 'military'`, [uid]);
  console.log('=== Military planets BEFORE tick ===');
  for (const r of before.rows) console.log(r.name, '→', JSON.stringify(r.queue));

  await c.query(`SELECT bot_ai_tick()`);

  const after = await c.query(`
    SELECT p.id, p.name,
           (SELECT jsonb_agg(jsonb_build_object('code', st.code, 'qty', sq.quantity))
              FROM shipyard_queue sq JOIN ship_types st ON st.id = sq.ship_type_id
              WHERE sq.planet_id = p.id) AS queue
    FROM planets p
    WHERE p.user_id = $1 AND p.autopilot_role = 'military'`, [uid]);
  console.log('\n=== Military planets AFTER tick ===');
  for (const r of after.rows) console.log(r.name, '→', JSON.stringify(r.queue));

  await c.end();
})();
