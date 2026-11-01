const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});
async function run() {
  await c.connect();

  // Get full validate_fleet_mission colonize section
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'validate_fleet_mission' ORDER BY length(prosrc) DESC LIMIT 1`);
  const src = r.rows[0].prosrc;
  const idx = src.indexOf('colonize');
  console.log('=== COLONIZE VALIDATION (full) ===');
  console.log(src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 1000)));

  // Max planets formula
  console.log('\n=== GAME SETTINGS / SPEEDS ===');
  const gs = await c.query(`SELECT proname FROM pg_proc WHERE proname LIKE '%game_speed%' OR proname LIKE '%max_planet%' OR proname LIKE '%get_game%'`);
  console.log(gs.rows);

  // Check settings table
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%setting%' OR table_name LIKE '%config%' OR table_name LIKE '%speed%')`);
  console.log('Config tables:', tables.rows);

  // Check bot current techs - specifically astrophysics and impulse_drive
  const techs = await c.query(`
    SELECT p.username, tt.code, ut.level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    JOIN profiles p ON p.id = ut.user_id
    WHERE p.is_bot = true AND tt.code IN ('astrophysics', 'impulse_drive', 'combustion_drive', 'computer_tech')
    ORDER BY p.username, tt.code
  `);
  console.log('\n=== BOT RELEVANT TECHS ===');
  console.log(techs.rows);

  // Check current bot shipyard levels
  const sy = await c.query(`
    SELECT p.username, bt.code, pb.level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    JOIN planets pl ON pl.id = pb.planet_id
    JOIN profiles p ON p.id = pl.user_id
    WHERE p.is_bot = true AND bt.code = 'shipyard'
    ORDER BY pb.level DESC
    LIMIT 10
  `);
  console.log('\n=== BOT SHIPYARD LEVELS ===');
  console.log(sy.rows);

  // Check debris_fields with data
  const df = await c.query(`SELECT COUNT(*) as cnt, SUM(metal) as total_metal, SUM(crystal) as total_crystal FROM debris_fields WHERE metal > 0 OR crystal > 0`);
  console.log('\n=== DEBRIS FIELDS WITH RESOURCES ===');
  console.log(df.rows);

  // Check how fleet arrival is processed - is there a process_fleet function?
  const pf = await c.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND (proname LIKE '%fleet%process%' OR proname LIKE '%process%fleet%' OR proname LIKE '%resolve%fleet%' OR proname LIKE '%handle_fleet%')`);
  console.log('\n=== FLEET PROCESSING FUNCTIONS ===');
  console.log(pf.rows);

  await c.end();
}
run().catch(e => { console.error(e); process.exit(1); });
