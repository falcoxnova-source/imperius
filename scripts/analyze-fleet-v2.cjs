const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 45000);

  try {
    await c.connect();
    console.log('✅ Connected\n');

    // 1. Planets columns (find resource columns)
    console.log('--- planets columns ---');
    const pcols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'planets' ORDER BY ordinal_position");
    pcols.rows.forEach(r => console.log('  ' + r.column_name));

    // 2. planet_resources columns
    console.log('\n--- planet_resources columns ---');
    const prcols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'planet_resources' ORDER BY ordinal_position");
    if (prcols.rows.length === 0) {
      console.log('  Table does not exist');
    } else {
      prcols.rows.forEach(r => console.log('  ' + r.column_name));
    }

    // 3. Bot planets basic info
    console.log('\n--- Bot planets ---');
    const planets = await c.query(`
      SELECT p.username, pl.galaxy, pl.solar_system, pl.position, pl.name
      FROM profiles p
      JOIN planets pl ON pl.user_id = p.id
      WHERE p.is_bot = true
      ORDER BY pl.galaxy, pl.solar_system, pl.position
    `);
    planets.rows.forEach(r => console.log('  ' + r.username + ' [' + r.galaxy + ':' + r.solar_system + ':' + r.position + '] ' + r.name));

    // 4. Bot ships
    console.log('\n--- Bot ships ---');
    const ships = await c.query(`
      SELECT p.username, st.name as ship_name, st.internal_name, ps.quantity
      FROM profiles p
      JOIN planets pl ON pl.user_id = p.id
      JOIN planet_ships ps ON ps.planet_id = pl.id AND ps.quantity > 0
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE p.is_bot = true
      ORDER BY p.username, st.name
    `);
    ships.rows.forEach(r => console.log('  ' + r.username + ': ' + r.ship_name + ' (' + r.internal_name + ') x' + r.quantity));

    // 5. Bot technologies
    console.log('\n--- Bot technologies (sample 3) ---');
    const techs = await c.query(`
      SELECT p.username, ut.espionage_tech, ut.combustion_drive, ut.impulse_drive, 
             ut.hyperspace_drive, ut.weapons_tech, ut.shielding_tech, ut.armour_tech, ut.computer_tech
      FROM profiles p
      JOIN user_technologies ut ON ut.user_id = p.id
      WHERE p.is_bot = true
      ORDER BY p.username
      LIMIT 3
    `);
    techs.rows.forEach(r => console.log('  ' + r.username + ': esp=' + r.espionage_tech + ' comb=' + r.combustion_drive + ' imp=' + r.impulse_drive + ' hyp=' + r.hyperspace_drive + ' comp=' + r.computer_tech + ' weap=' + r.weapons_tech + ' shield=' + r.shielding_tech + ' armour=' + r.armour_tech));

    // 6. Near players
    console.log('\n--- Real players near bots (same galaxy) ---');
    const near = await c.query(`
      SELECT DISTINCT bp.username as bot_name, bpl.galaxy as bg, bpl.solar_system as bs, bpl.position as bp,
        rp.username as player_name, rpl.galaxy as pg, rpl.solar_system as ps, rpl.position as pp
      FROM profiles bp
      JOIN planets bpl ON bpl.user_id = bp.id
      JOIN planets rpl ON rpl.galaxy = bpl.galaxy AND ABS(rpl.solar_system - bpl.solar_system) <= 50 AND NOT rpl.is_destroyed
      JOIN profiles rp ON rp.id = rpl.user_id AND rp.is_bot = false AND rp.is_admin = false
      WHERE bp.is_bot = true
      ORDER BY bg, bs
      LIMIT 20
    `);
    near.rows.forEach(r => console.log('  ' + r.bot_name + ' [' + r.bg + ':' + r.bs + ':' + r.bp + '] → ' + r.player_name + ' [' + r.pg + ':' + r.ps + ':' + r.pp + ']'));

    // 7. Fleet functions
    console.log('\n--- Fleet functions ---');
    const fns = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%fleet%' AND pronamespace = 'public'::regnamespace ORDER BY proname");
    fns.rows.forEach(r => console.log('  ' + r.proname));

    // 8. secure_send_fleet signature + first 100 chars
    console.log('\n--- secure_send_fleet ---');
    const sig = await c.query("SELECT pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as ret FROM pg_proc WHERE proname = 'secure_send_fleet'");
    sig.rows.forEach(r => console.log('  Args: ' + r.args + '\n  Returns: ' + r.ret));

    // 9. fleet_movements columns
    console.log('\n--- fleet_movements columns ---');
    const fm = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fleet_movements' ORDER BY ordinal_position");
    fm.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

    // 10. ship_types (espionage probe + light fighter)
    console.log('\n--- ship_types (key ships) ---');
    const st = await c.query("SELECT id, name, internal_name, speed, fuel_consumption, cargo_capacity FROM ship_types WHERE internal_name IN ('espionage_probe', 'light_fighter', 'small_cargo', 'large_cargo') ORDER BY id");
    st.rows.forEach(r => console.log('  id=' + r.id + ' ' + r.internal_name + ' speed=' + r.speed + ' fuel=' + r.fuel_consumption + ' cargo=' + r.cargo_capacity));

    // 11. secure_send_fleet body (first 3000 chars to see auth.uid usage)
    console.log('\n--- secure_send_fleet body (first 3000 chars) ---');
    const body = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet'");
    console.log(body.rows[0]?.prosrc?.substring(0, 3000));

    console.log('\n✅ Analysis complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    clearTimeout(timer);
    await c.end();
  }
}

main();
