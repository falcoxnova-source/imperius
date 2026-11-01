const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const tick = await c.query(`SELECT bot_ai_tick() AS r`);
  console.log('tick:', JSON.stringify(tick.rows[0].r));

  // Check for any errors in recent events
  const errEv = await c.query(`
    SELECT pr.email, p.name, ev.payload, ev.created_at
      FROM autopilot_events ev
      JOIN planets p ON p.id = ev.planet_id
      JOIN profiles pr ON pr.id = ev.user_id
     WHERE ev.event_type = 'phaseH_result'
       AND ev.created_at > now() - interval '90 seconds'
       AND (ev.payload->'result'->>'success')::boolean = false
     ORDER BY ev.created_at DESC
     LIMIT 10`);
  console.log('\nphaseH failures in last 90s:', errEv.rows.length);
  for (const row of errEv.rows) console.log(row.created_at.toISOString(), row.email, row.name, JSON.stringify(row.payload));

  // Check military planets queueing cargo now
  const qc = await c.query(`
    SELECT pr.email, p.name, ev.payload, ev.created_at
      FROM autopilot_events ev
      JOIN planets p ON p.id = ev.planet_id
      JOIN profiles pr ON pr.id = ev.user_id
     WHERE ev.event_type = 'ships_queued'
       AND p.autopilot_role = 'military'
       AND ev.payload->>'ship' IN ('small_cargo','large_cargo')
       AND ev.created_at > now() - interval '90 seconds'
     ORDER BY ev.created_at DESC
     LIMIT 20`);
  console.log('\nMilitary cargo queued in last 90s:', qc.rows.length);
  for (const row of qc.rows) console.log(row.created_at.toISOString(), row.email, row.name, JSON.stringify(row.payload));

  // NOVA miner transport: only one per miner per tick now
  const uid = (await c.query(`SELECT id FROM profiles WHERE email='samaileal01@gmail.com'`)).rows[0].id;
  const tr = await c.query(`
    SELECT ev.created_at, p.name, ev.payload
      FROM autopilot_events ev
      JOIN planets p ON p.id = ev.planet_id
     WHERE ev.user_id = $1 AND ev.event_type = 'transport_sent'
       AND ev.created_at > now() - interval '90 seconds'
     ORDER BY ev.created_at DESC`, [uid]);
  console.log('\nNOVA transports last 90s:', tr.rows.length);
  for (const row of tr.rows) console.log(row.created_at.toISOString(), row.name, JSON.stringify(row.payload));

  await c.end();
})();
