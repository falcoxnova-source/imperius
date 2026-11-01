const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  
  // Set 20 satellites pending (will build 20 MORE, countdown)
  await c.query(`UPDATE ai_planet_custom_orders SET ships='{"solar_satellite":20}'::jsonb WHERE planet_id='bbdc3248-7707-4bfc-a576-47ecc3669cd1'`);
  console.log('Set 20 satellites PENDING');
  
  // Check current satellites
  let s = await c.query(`SELECT st.code, ps.quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id WHERE ps.planet_id='bbdc3248-7707-4bfc-a576-47ecc3669cd1' AND st.code='solar_satellite'`);
  console.log('Satellites BEFORE tick:', s.rows[0]?.quantity || 0);
  
  // Run tick
  const r = await c.query('SELECT bot_ai_tick()');
  console.log('Tick:', JSON.stringify(r.rows[0].bot_ai_tick, null, 2));
  
  // Check satellites after
  s = await c.query(`SELECT st.code, ps.quantity FROM planet_ships ps JOIN ship_types st ON st.id=ps.ship_type_id WHERE ps.planet_id='bbdc3248-7707-4bfc-a576-47ecc3669cd1' AND st.code='solar_satellite'`);
  console.log('Satellites AFTER tick:', s.rows[0]?.quantity || 0);
  
  // Check remaining in orders
  const orders = await c.query(`SELECT ships FROM ai_planet_custom_orders WHERE planet_id='bbdc3248-7707-4bfc-a576-47ecc3669cd1'`);
  console.log('Remaining orders:', JSON.stringify(orders.rows[0]?.ships));
  
  // Check events
  const ev = await c.query(`SELECT event_type, payload, created_at FROM autopilot_events WHERE planet_id='bbdc3248-7707-4bfc-a576-47ecc3669cd1' AND payload->>'mode'='custom' ORDER BY created_at DESC LIMIT 3`);
  console.log('Custom events:');
  for (const e of ev.rows) {
    console.log(' ', e.event_type, JSON.stringify(e.payload));
  }
  
  await c.end();
})();
