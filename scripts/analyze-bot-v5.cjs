const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();

  // 1. Colony ship - code, requirements, capacity
  console.log('\n=== COLONY SHIP ===');
  const cs = await c.query(`
    SELECT st.* FROM ship_types st WHERE st.code = 'colony_ship'
  `);
  console.log(cs.rows);

  // Colony ship requirements
  const csReq = await c.query(`
    SELECT sr.*, bt.code AS building_code, tt.code AS tech_code, sr.required_building_level, sr.required_tech_level
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
    WHERE sr.ship_type_id = (SELECT id FROM ship_types WHERE code = 'colony_ship')
  `);
  console.log('Requirements:', csReq.rows);

  // 2. Astrophysics tech
  console.log('\n=== ASTROPHYSICS ===');
  const astro = await c.query(`
    SELECT tt.id, tt.code, tt.base_metal, tt.base_crystal, tt.base_deuterium, tt.cost_factor, tt.max_level
    FROM technology_types tt WHERE tt.code = 'astrophysics'
  `);
  console.log(astro.rows);

  // 3. Max planets formula - check if there's a function
  console.log('\n=== MAX PLANETS FUNCTIONS ===');
  const maxPl = await c.query(`
    SELECT proname FROM pg_proc WHERE proname LIKE '%max%planet%' OR proname LIKE '%colony%limit%' OR proname LIKE '%planet_limit%'
  `);
  console.log(maxPl.rows);

  // 4. Current bot planets count
  console.log('\n=== BOT PLANET COUNTS ===');
  const botPlanets = await c.query(`
    SELECT p.username, COUNT(pl.id) AS planet_count, 
      COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON tt.id = ut.technology_type_id WHERE ut.user_id = p.id AND tt.code = 'astrophysics'), 0) AS astro_level
    FROM profiles p
    LEFT JOIN planets pl ON pl.user_id = p.id AND pl.planet_type = 'planet'
    WHERE p.is_bot = true
    GROUP BY p.id, p.username
    ORDER BY planet_count DESC
    LIMIT 10
  `);
  console.log(botPlanets.rows);

  // 5. Debris fields - check if table exists
  console.log('\n=== DEBRIS FIELDS ===');
  const debris = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'debris_fields' OR table_name = 'debris'
    ORDER BY table_name, ordinal_position
  `);
  console.log(debris.rows.length > 0 ? debris.rows : 'NO debris table found');

  // Check if planets have debris columns
  const debrisCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'planets' AND column_name LIKE '%debris%'
  `);
  console.log('Planets debris cols:', debrisCols.rows);

  // 6. Incoming fleets detection
  console.log('\n=== FLEET DETECTION ===');
  const incomingFleets = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'fleets'
    ORDER BY ordinal_position
  `);
  console.log('Fleet columns:', incomingFleets.rows.map(r => r.column_name));

  // 7. All combat ship types with stats
  console.log('\n=== ALL SHIP TYPES ===');
  const ships = await c.query(`
    SELECT st.id, st.code, st.metal_cost, st.crystal_cost, st.deuterium_cost, st.cargo_capacity
    FROM ship_types st
    ORDER BY st.id
  `);
  console.log(ships.rows);

  // 8. Recycler type
  console.log('\n=== RECYCLER ===');
  const recycler = await c.query(`
    SELECT st.id, st.code, st.cargo_capacity FROM ship_types st WHERE st.code = 'recycler'
  `);
  console.log(recycler.rows);

  // 9. Check how colonize mission works
  console.log('\n=== COLONIZE MISSION VALIDATION ===');
  const valFunc = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'validate_fleet_mission'
    ORDER BY length(prosrc) DESC LIMIT 1
  `);
  if (valFunc.rows.length > 0) {
    const src = valFunc.rows[0].prosrc;
    const colonizeIdx = src.indexOf('colonize');
    if (colonizeIdx > -1) {
      console.log('Colonize section:', src.substring(Math.max(0, colonizeIdx - 200), Math.min(src.length, colonizeIdx + 500)));
    } else {
      console.log('No colonize section found in validate_fleet_mission');
    }
  }

  // 10. Check empty positions in galaxies where bots live
  console.log('\n=== EMPTY POSITIONS NEAR BOTS ===');
  const emptyPos = await c.query(`
    WITH bot_planets AS (
      SELECT DISTINCT pl.galaxy, pl.solar_system
      FROM planets pl
      JOIN profiles p ON p.id = pl.user_id
      WHERE p.is_bot = true
      LIMIT 5
    )
    SELECT bp.galaxy, bp.solar_system, 
      (SELECT array_agg(pos) FROM generate_series(1,15) pos 
       WHERE NOT EXISTS(SELECT 1 FROM planets pp WHERE pp.galaxy = bp.galaxy AND pp.solar_system = bp.solar_system AND pp.position = pos))
      AS empty_positions
    FROM bot_planets bp
  `);
  console.log(emptyPos.rows);

  // 11. Check game_config for max planets
  console.log('\n=== GAME CONFIG MAX PLANETS ===');
  const gc = await c.query(`
    SELECT * FROM game_config WHERE key LIKE '%planet%' OR key LIKE '%colony%' OR key LIKE '%astro%'
  `);
  console.log(gc.rows.length > 0 ? gc.rows : 'No relevant game_config');

  // 12. Check if there's a handle_colonization function
  console.log('\n=== COLONIZATION FUNCTIONS ===');
  const colFuncs = await c.query(`
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (proname LIKE '%colon%' OR proname LIKE '%create_planet%' OR proname LIKE '%new_planet%')
  `);
  console.log(colFuncs.rows);

  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });
