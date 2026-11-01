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

  // Boost all bot resources to test phases B/C/D
  const r = await c.query(`
    UPDATE planet_resources 
    SET metal = 500000, crystal = 300000, deuterium = 200000
    WHERE planet_id IN (
      SELECT pl.id FROM planets pl 
      JOIN profiles p ON p.id = pl.user_id 
      WHERE p.is_bot = true AND pl.planet_type = 'planet'
    )
  `);
  console.log('Resources boosted for', r.rowCount, 'bot planets');

  // Now run cycles
  for (let i = 0; i < 40; i++) {
    await new Promise(ok => setTimeout(ok, 2000));
    await c.query('SELECT optimized_global_queue_processor()');
    const tick = await c.query('SELECT bot_ai_tick()');
    const d = tick.rows[0].bot_ai_tick;
    
    if (d.buildings_queued > 0 || d.research_started > 0 || d.ships_queued > 0 || d.defenses_queued > 0) {
      console.log('Tick', i+1, JSON.stringify(d));
    }
    
    if (d.research_started > 0 || d.ships_queued > 0 || d.defenses_queued > 0) {
      console.log('*** PHASE B/C/D ACTIVE! ***');
      break;
    }
  }

  // Final status
  const s = await c.query(`
    SELECT p.username,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='metal_mine') as mine,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='robotics_factory') as rob,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='shipyard') as sy,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='research_lab') as lab
    FROM profiles p JOIN planets pl ON pl.user_id=p.id AND pl.planet_type='planet'
    WHERE p.is_bot = true ORDER BY p.username LIMIT 5
  `);
  console.log('\n=== BOT LEVELS ===');
  console.table(s.rows);

  // Check techs
  const techs = await c.query(`
    SELECT p.username, tt.code, ut.level, ut.is_researching, ut.research_end_time
    FROM user_technologies ut
    JOIN profiles p ON p.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true LIMIT 10
  `);
  if (techs.rows.length > 0) {
    console.log('\n=== BOT TECHS ===');
    console.table(techs.rows);
  }

  // Check shipyard queue
  const sq = await c.query(`
    SELECT p.username, sq.item_type, COALESCE(st.code, dt.code) as unit, sq.quantity
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id=sq.planet_id
    JOIN profiles p ON p.id=pl.user_id
    LEFT JOIN ship_types st ON st.id=sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id=sq.defense_type_id
    WHERE p.is_bot = true LIMIT 10
  `);
  if (sq.rows.length > 0) {
    console.log('\n=== BOT SHIPYARD QUEUE ===');
    console.table(sq.rows);
  }

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
