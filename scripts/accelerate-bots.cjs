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
  
  // Run cycles until research or ships trigger
  for (let i = 0; i < 80; i++) {
    await new Promise(ok => setTimeout(ok, 2000));
    await c.query('SELECT optimized_global_queue_processor()');
    const r = await c.query('SELECT bot_ai_tick()');
    const d = r.rows[0].bot_ai_tick;
    
    if (d.research_started > 0 || d.ships_queued > 0 || d.defenses_queued > 0) {
      console.log('*** PHASE B/C/D ACTIVE! Tick', i+1, JSON.stringify(d));
      break;
    }
    if (d.buildings_queued > 0 && (i % 5 === 0)) {
      console.log('Tick', i+1, 'buildings:', d.buildings_queued);
    }
  }

  // Show final bot status
  const s = await c.query(`
    SELECT p.username,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='metal_mine') as mine,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='crystal_mine') as crys,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='solar_plant') as solar,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='deuterium_synthesizer') as deut,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='robotics_factory') as rob,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='shipyard') as sy,
      (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='research_lab') as lab
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    WHERE p.is_bot = true
    ORDER BY p.username
    LIMIT 5
  `);
  console.log('\n=== BOT BUILDING LEVELS (sample) ===');
  console.table(s.rows);

  // Check technologies
  const techs = await c.query(`
    SELECT p.username, tt.code, ut.level, ut.is_researching
    FROM user_technologies ut
    JOIN profiles p ON p.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true
    LIMIT 10
  `);
  if (techs.rows.length > 0) {
    console.log('\n=== BOT TECHNOLOGIES ===');
    console.table(techs.rows);
  }

  // Check shipyard queue
  const sq = await c.query(`
    SELECT p.username, sq.item_type, COALESCE(st.code, dt.code) as unit,
           sq.quantity, sq.quantity_completed
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id = sq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = sq.defense_type_id
    WHERE p.is_bot = true
    LIMIT 10
  `);
  if (sq.rows.length > 0) {
    console.log('\n=== BOT SHIPYARD QUEUE ===');
    console.table(sq.rows);
  }

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
