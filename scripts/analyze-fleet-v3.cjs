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

    // 1. ship_types columns
    console.log('--- ship_types columns ---');
    const stcols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ship_types' ORDER BY ordinal_position");
    stcols.rows.forEach(r => console.log('  ' + r.column_name));

    // 2. Key ships data
    console.log('\n--- ship_types (all) ---');
    const st = await c.query("SELECT id, code, name, base_speed, fuel_consumption, cargo_capacity, category FROM ship_types ORDER BY id");
    st.rows.forEach(r => console.log('  id=' + r.id + ' ' + r.code + ' ' + r.name + ' cat=' + r.category + ' spd=' + r.base_speed + ' fuel=' + r.fuel_consumption + ' cargo=' + r.cargo_capacity));

    // 3. Bot ships
    console.log('\n--- Bot ships ---');
    const ships = await c.query(`
      SELECT p.username, st.name as ship_name, st.id as ship_id, ps.quantity
      FROM profiles p
      JOIN planets pl ON pl.user_id = p.id
      JOIN planet_ships ps ON ps.planet_id = pl.id AND ps.quantity > 0
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE p.is_bot = true
      ORDER BY p.username, st.id
    `);
    ships.rows.forEach(r => console.log('  ' + r.username + ': ' + r.ship_name + ' (id=' + r.ship_id + ') x' + r.quantity));

    // 4. Bot techs
    console.log('\n--- Bot technologies (sample 3) ---');
    const techs = await c.query(`
      SELECT p.username, ut.espionage_tech, ut.combustion_drive, ut.impulse_drive, 
             ut.hyperspace_drive, ut.computer_tech, ut.weapons_tech, ut.shielding_tech, ut.armour_tech
      FROM profiles p
      JOIN user_technologies ut ON ut.user_id = p.id
      WHERE p.is_bot = true
      ORDER BY p.username
      LIMIT 5
    `);
    techs.rows.forEach(r => console.log('  ' + r.username + ': esp=' + r.espionage_tech + ' comb=' + r.combustion_drive + ' imp=' + r.impulse_drive + ' comp=' + r.computer_tech));

    // 5. Near players  
    console.log('\n--- Real players near bots ---');
    const near = await c.query(`
      SELECT DISTINCT bp.username as bot_name, bpl.galaxy as bg, bpl.solar_system as bs, bpl.position as bpos,
        rp.username as player_name, rpl.galaxy as pg, rpl.solar_system as ps2, rpl.position as pp
      FROM profiles bp
      JOIN planets bpl ON bpl.user_id = bp.id
      JOIN planets rpl ON rpl.galaxy = bpl.galaxy AND ABS(rpl.solar_system - bpl.solar_system) <= 50 AND NOT rpl.is_destroyed
      JOIN profiles rp ON rp.id = rpl.user_id AND rp.is_bot = false AND rp.is_admin = false
      WHERE bp.is_bot = true
      ORDER BY bg, bs
      LIMIT 20
    `);
    near.rows.forEach(r => console.log('  ' + r.bot_name + ' [' + r.bg + ':' + r.bs + ':' + r.bpos + '] → ' + r.player_name + ' [' + r.pg + ':' + r.ps2 + ':' + r.pp + ']'));

    // 6. Fleet functions
    console.log('\n--- Fleet functions ---');
    const fns = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%fleet%' AND pronamespace = 'public'::regnamespace ORDER BY proname");
    fns.rows.forEach(r => console.log('  ' + r.proname));

    // 7. secure_send_fleet signature
    console.log('\n--- secure_send_fleet signature ---');
    const sig = await c.query("SELECT pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as ret FROM pg_proc WHERE proname = 'secure_send_fleet'");
    sig.rows.forEach(r => console.log('  Args: ' + r.args + '\n  Returns: ' + r.ret));

    // 8. fleet_movements columns
    console.log('\n--- fleet_movements columns ---');
    const fm = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fleet_movements' ORDER BY ordinal_position");
    fm.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

    // 9. secure_send_fleet body (first 4000 chars)
    console.log('\n--- secure_send_fleet body START ---');
    const body = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet'");
    const src = body.rows[0]?.prosrc || '';
    console.log(src.substring(0, 4000));
    console.log('\n--- secure_send_fleet body MIDDLE ---');
    console.log(src.substring(4000, 8000));
    console.log('\n--- LENGTH:', src.length);

    console.log('\n✅ Analysis complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    clearTimeout(timer);
    await c.end();
  }
}

main();
