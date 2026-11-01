const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  
  // Check planet and user
  const p = await c.query(`
    SELECT p.id, p.name, p.autopilot_role, p.user_id, pr.username, pr.autopilot_active, pr.autopilot_eligible, pr.is_bot,
           pr.last_manual_action, pr.autopilot_vip_boost, pr.autopilot_vip_boost_expires_at
    FROM planets p JOIN profiles pr ON pr.id=p.user_id 
    WHERE p.autopilot_role='custom'
  `);
  for (const row of p.rows) {
    console.log('User:', row.username, '| autopilot_active:', row.autopilot_active, '| eligible:', row.autopilot_eligible, '| is_bot:', row.is_bot);
    console.log('last_manual_action:', row.last_manual_action, '| vip_boost:', row.autopilot_vip_boost);
    
    // Check has_autopilot_access
    const acc = await c.query(`SELECT has_autopilot_access($1) as has_access`, [row.user_id]);
    console.log('has_autopilot_access:', acc.rows[0]?.has_access);
    
    // Check current ships
    const ships = await c.query(`
      SELECT st.code, ps.quantity FROM planet_ships ps 
      JOIN ship_types st ON st.id=ps.ship_type_id 
      WHERE ps.planet_id=$1 AND st.code='solar_satellite'
    `, [row.id]);
    console.log('Current solar_satellites:', ships.rows[0]?.quantity || 0);

    // Check resources
    const res = await c.query(`SELECT metal, crystal, deuterium FROM planet_resources WHERE planet_id=$1`, [row.id]);
    console.log('Resources:', res.rows[0]);

    // Check custom orders
    const orders = await c.query(`SELECT * FROM ai_planet_custom_orders WHERE planet_id=$1`, [row.id]);
    console.log('Custom orders:', JSON.stringify(orders.rows[0]?.ships));
    
    // Check shipyard queue
    const sq = await c.query(`SELECT * FROM shipyard_queue WHERE planet_id=$1`, [row.id]);
    console.log('Shipyard queue:', sq.rows.length, 'items');
    
    // Check autopilot events
    const ev = await c.query(`SELECT event_type, payload, created_at FROM autopilot_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`, [row.user_id]);
    console.log('Recent events:');
    for (const e of ev.rows) {
      console.log(' ', e.created_at, e.event_type, JSON.stringify(e.payload));
    }
    // Check ALL planets of this user
    const allp = await c.query(`SELECT p.name, p.autopilot_role FROM planets p WHERE p.user_id=$1 AND NOT p.is_destroyed ORDER BY p.is_main_planet DESC`, [row.user_id]);
    console.log('\nAll planets:');
    for (const pp of allp.rows) {
      console.log(' ', pp.name, '| role:', pp.autopilot_role);
    }
  }

  await c.end();
})();
