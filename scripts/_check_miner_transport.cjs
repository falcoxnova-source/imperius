const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  // 1. Bots con planeta minero + militar
  const botsMix = await client.query(`
    SELECT p.user_id,
           pr.username,
           COUNT(*) FILTER (WHERE p.autopilot_role = 'miner')    AS miners,
           COUNT(*) FILTER (WHERE p.autopilot_role = 'military') AS militaries,
           COUNT(*) FILTER (WHERE p.autopilot_role = 'balanced') AS balanced
    FROM planets p
    JOIN profiles pr ON pr.id = p.user_id
    WHERE pr.is_bot = true
      AND p.planet_type = 'planet'
      AND NOT p.is_destroyed
    GROUP BY p.user_id, pr.username
    HAVING COUNT(*) FILTER (WHERE p.autopilot_role = 'miner') >= 1
       AND COUNT(*) FILTER (WHERE p.autopilot_role = 'military') >= 1
    ORDER BY miners DESC
    LIMIT 8
  `);
  console.log('Bots con miner+military:', botsMix.rowCount);
  console.table(botsMix.rows);

  const cols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='autopilot_events' ORDER BY ordinal_position`);
  console.log('autopilot_events cols:', cols.rows.map(r=>r.column_name).join(', '));

  const ev = await client.query(`
    SELECT count(*) AS transports_2h
    FROM autopilot_events e
    WHERE e.event_type = 'transport_sent'
      AND e.created_at > now() - interval '2 hours'
      AND (e.payload->>'role') = 'miner'
  `);
  console.log('transport_sent desde mineros (2h):', ev.rows[0].transports_2h);

  const sample = await client.query(`
    SELECT e.created_at, pr.username, e.payload
    FROM autopilot_events e
    JOIN profiles pr ON pr.id = e.user_id
    WHERE e.event_type = 'transport_sent'
      AND (e.payload->>'role') = 'miner'
      AND e.created_at > now() - interval '2 hours'
    ORDER BY e.created_at DESC
    LIMIT 5
  `);
  console.log('Últimos 5 transportes desde mineros:');
  console.table(sample.rows);

  // 4. Flotas de transporte activas en vuelo de mineros → militares
  const flying = await client.query(`
    SELECT count(*) AS flying_now
    FROM fleets f
    JOIN planets po ON po.id = f.origin_planet_id
    JOIN planets pt ON pt.galaxy = f.target_galaxy
                    AND pt.solar_system = f.target_system
                    AND pt.position = f.target_position
                    AND pt.user_id = f.user_id
                    AND pt.planet_type = 'planet'
    WHERE f.mission_type = 'transport'
      AND f.is_completed = false
      AND po.autopilot_role = 'miner'
      AND pt.autopilot_role = 'military'
  `);
  console.log('Transportes miner→military en vuelo ahora:', flying.rows[0].flying_now);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
