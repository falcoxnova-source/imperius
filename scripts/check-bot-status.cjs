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

  // 1. Check bot building levels and resources
  const bots = await c.query(`
    SELECT p.username, 
           COALESCE(pr.metal::int, 0) as metal,
           COALESCE(pr.crystal::int, 0) as crystal,
           COALESCE(pr.deuterium::int, 0) as deut,
           (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='metal_mine') as mine,
           (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='research_lab') as lab,
           (SELECT COALESCE(pb.level,0) FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id WHERE pb.planet_id=pl.id AND bt.code='shipyard') as sy,
           (SELECT COUNT(*) FROM building_queue bq WHERE bq.planet_id=pl.id) as bq,
           (SELECT COUNT(*) FROM shipyard_queue sq WHERE sq.planet_id=pl.id) as sq,
           (SELECT COUNT(*) FROM user_technologies ut WHERE ut.user_id=p.id AND ut.is_researching=true) as researching
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    LEFT JOIN planet_resources pr ON pr.planet_id = pl.id
    WHERE p.is_bot = true
    ORDER BY p.username
  `);
  
  console.log('\n=== BOT STATUS ===');
  console.table(bots.rows);

  // 2. Check user_technologies for bots
  const techs = await c.query(`
    SELECT p.username, tt.code, ut.level, ut.is_researching, ut.research_end_time
    FROM user_technologies ut
    JOIN profiles p ON p.id = ut.user_id
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE p.is_bot = true
    ORDER BY p.username, tt.code
  `);
  console.log('\n=== BOT TECHNOLOGIES ===');
  console.table(techs.rows);

  // 3. Check shipyard queue for bots
  const ships = await c.query(`
    SELECT p.username, sq.item_type, 
           COALESCE(st.code, dt.code) as unit_code,
           sq.quantity, sq.quantity_completed, sq.current_unit_end_time
    FROM shipyard_queue sq
    JOIN planets pl ON pl.id = sq.planet_id
    JOIN profiles p ON p.id = pl.user_id
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = sq.defense_type_id
    WHERE p.is_bot = true
  `);
  console.log('\n=== BOT SHIPYARD QUEUE ===');
  console.table(ships.rows);

  await c.end();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
