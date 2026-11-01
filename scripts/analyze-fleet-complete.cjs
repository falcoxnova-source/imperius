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

  const timer = setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 30000);

  try {
    await c.connect();
    console.log('✅ Connected\n');

    // 1. Find profiles columns to use correct name
    const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE '%point%' OR (table_name = 'profiles' AND column_name LIKE '%score%')");
    console.log('--- profiles columns with point/score ---');
    cols.rows.forEach(r => console.log('  ' + r.column_name));

    // 2. Bot profiles
    console.log('\n--- Bot profiles ---');
    const bots = await c.query("SELECT id, username, is_bot FROM profiles WHERE is_bot = true ORDER BY username");
    bots.rows.forEach(r => console.log('  ' + r.username + ' (' + r.id.substring(0, 8) + ')'));
    console.log('  Total bots:', bots.rows.length);

    // 3. Bot planets
    console.log('\n--- Bot planets ---');
    const planets = await c.query(`
      SELECT p.username, pl.galaxy, pl.solar_system, pl.position, pl.name, pl.metal, pl.crystal, pl.deuterium
      FROM profiles p
      JOIN planets pl ON pl.user_id = p.id
      WHERE p.is_bot = true
      ORDER BY pl.galaxy, pl.solar_system, pl.position
    `);
    planets.rows.forEach(r => console.log('  ' + r.username + ' [' + r.galaxy + ':' + r.solar_system + ':' + r.position + '] ' + r.name + ' | M:' + Math.floor(r.metal) + ' C:' + Math.floor(r.crystal) + ' D:' + Math.floor(r.deuterium)));

    // 4. Bot ships
    console.log('\n--- Bot ships ---');
    const ships = await c.query(`
      SELECT p.username, st.name as ship_name, ps.quantity
      FROM profiles p
      JOIN planets pl ON pl.user_id = p.id
      JOIN planet_ships ps ON ps.planet_id = pl.id AND ps.quantity > 0
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE p.is_bot = true
      ORDER BY p.username, st.name
    `);
    ships.rows.forEach(r => console.log('  ' + r.username + ': ' + r.ship_name + ' x' + r.quantity));

    // 5. Bot technologies (espionage_tech, combustion_drive, etc)
    console.log('\n--- Bot technologies ---');
    const techs = await c.query(`
      SELECT p.username, ut.espionage_tech, ut.combustion_drive, ut.impulse_drive, ut.hyperspace_drive, ut.weapons_tech, ut.shielding_tech, ut.armour_tech, ut.computer_tech
      FROM profiles p
      JOIN user_technologies ut ON ut.user_id = p.id
      WHERE p.is_bot = true
      ORDER BY p.username
      LIMIT 5
    `);
    techs.rows.forEach(r => console.log('  ' + r.username + ': esp=' + r.espionage_tech + ' comb=' + r.combustion_drive + ' imp=' + r.impulse_drive + ' hyp=' + r.hyperspace_drive + ' comp=' + r.computer_tech));

    // 6. Near players
    console.log('\n--- Real players near bots ---');
    const near = await c.query(`
      SELECT DISTINCT bp.username as bot_name, rp.username as player_name,
        rpl.galaxy, rpl.solar_system, rpl.position
      FROM profiles bp
      JOIN planets bpl ON bpl.user_id = bp.id
      JOIN planets rpl ON rpl.galaxy = bpl.galaxy AND rpl.solar_system = bpl.solar_system AND NOT rpl.is_destroyed
      JOIN profiles rp ON rp.id = rpl.user_id AND rp.is_bot = false AND rp.is_admin = false
      WHERE bp.is_bot = true
      ORDER BY rpl.galaxy, rpl.solar_system
      LIMIT 20
    `);
    near.rows.forEach(r => console.log('  ' + r.bot_name + ' → ' + r.player_name + ' [' + r.galaxy + ':' + r.solar_system + ':' + r.position + ']'));

    // 7. Fleet-related functions
    console.log('\n--- Fleet functions ---');
    const fns = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%fleet%' AND pronamespace = 'public'::regnamespace ORDER BY proname");
    fns.rows.forEach(r => console.log('  ' + r.proname));

    // 8. secure_send_fleet signature
    console.log('\n--- secure_send_fleet signature ---');
    const sig = await c.query("SELECT pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as ret FROM pg_proc WHERE proname = 'secure_send_fleet'");
    sig.rows.forEach(r => console.log('  Args: ' + r.args + '\n  Returns: ' + r.ret));

    // 9. fleet_movements columns
    console.log('\n--- fleet_movements columns ---');
    const fm = await c.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'fleet_movements' ORDER BY ordinal_position");
    fm.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')' + (r.is_nullable === 'NO' ? ' NOT NULL' : '')));

    // 10. check_noob_protection signature
    console.log('\n--- check_noob_protection ---');
    const np = await c.query("SELECT pg_get_function_arguments(oid) as args FROM pg_proc WHERE proname = 'check_noob_protection'");
    np.rows.forEach(r => console.log('  Args: ' + r.args));

    console.log('\n✅ Analysis complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    clearTimeout(timer);
    await c.end();
  }
}

main();
