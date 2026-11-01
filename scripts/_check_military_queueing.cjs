const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Check all military planets across all users: recent autopilot events for ships_queued with cargo
  const r = await c.query(`
    SELECT ev.created_at, pr.email, p.name AS planet, p.autopilot_role, ev.payload
    FROM autopilot_events ev
    JOIN planets p ON p.id = ev.planet_id
    JOIN profiles pr ON pr.id = ev.user_id
    WHERE ev.event_type = 'ships_queued'
      AND p.autopilot_role = 'military'
      AND ev.created_at > now() - interval '10 minutes'
      AND (ev.payload->>'ship' IN ('small_cargo','large_cargo'))
    ORDER BY ev.created_at DESC
    LIMIT 40`);
  console.log('Military planets that queued cargo ships in last 10 min (should be empty):', r.rows.length);
  for (const row of r.rows) console.log(row.created_at.toISOString(), row.email, row.planet, JSON.stringify(row.payload));

  // Also check combat ship queueing still works
  const r2 = await c.query(`
    SELECT ev.created_at, pr.email, p.name AS planet, ev.payload
    FROM autopilot_events ev
    JOIN planets p ON p.id = ev.planet_id
    JOIN profiles pr ON pr.id = ev.user_id
    WHERE ev.event_type = 'ships_queued'
      AND p.autopilot_role = 'military'
      AND ev.created_at > now() - interval '10 minutes'
    ORDER BY ev.created_at DESC
    LIMIT 15`);
  console.log('\nRecent military ship queueing (any type):');
  for (const row of r2.rows) console.log(row.created_at.toISOString(), row.email, row.planet, JSON.stringify(row.payload));

  await c.end();
})();
