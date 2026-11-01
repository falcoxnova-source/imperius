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

    // 1. user_technologies columns
    console.log('--- user_technologies columns ---');
    const utcols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_technologies' ORDER BY ordinal_position");
    utcols.rows.forEach(r => console.log('  ' + r.column_name));

    // 2. Bot tech sample (select all)
    console.log('\n--- Bot tech sample (1 bot) ---');
    const tech = await c.query(`SELECT ut.* FROM user_technologies ut JOIN profiles p ON p.id = ut.user_id WHERE p.is_bot = true LIMIT 1`);
    if (tech.rows.length > 0) {
      Object.entries(tech.rows[0]).forEach(([k, v]) => {
        if (k !== 'user_id' && k !== 'id' && v !== null && v !== 0 && v !== false) {
          console.log('  ' + k + ': ' + v);
        }
      });
    }

    // 3. Near players
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
    near.rows.forEach(r => console.log('  ' + r.bot_name + ' [' + r.bg + ':' + r.bs + ':' + r.bpos + '] -> ' + r.player_name + ' [' + r.pg + ':' + r.ps2 + ':' + r.pp + ']'));

    // 4. Fleet functions
    console.log('\n--- Fleet functions ---');
    const fns = await c.query("SELECT proname FROM pg_proc WHERE proname LIKE '%fleet%' AND pronamespace = 'public'::regnamespace ORDER BY proname");
    fns.rows.forEach(r => console.log('  ' + r.proname));

    // 5. secure_send_fleet signature
    console.log('\n--- secure_send_fleet signature ---');
    const sig = await c.query("SELECT pg_get_function_arguments(oid) as args, pg_get_function_result(oid) as ret FROM pg_proc WHERE proname = 'secure_send_fleet'");
    sig.rows.forEach(r => console.log('  Args: ' + r.args + '\n  Returns: ' + r.ret));

    // 6. fleet_movements columns
    console.log('\n--- fleet_movements columns ---');
    const fm = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fleet_movements' ORDER BY ordinal_position");
    fm.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

    // 7. secure_send_fleet body FULL (in chunks)
    console.log('\n--- secure_send_fleet body ---');
    const body = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'secure_send_fleet'");
    const src = body.rows[0]?.prosrc || '';
    // Print in 4000 char chunks
    for (let i = 0; i < src.length; i += 4000) {
      console.log(src.substring(i, i + 4000));
    }
    console.log('--- LENGTH:', src.length);

    // 8. validate_fleet_mission body
    console.log('\n--- validate_fleet_mission ---');
    const vfm = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'validate_fleet_mission'");
    if (vfm.rows.length > 0) {
      console.log(vfm.rows[0].prosrc.substring(0, 3000));
    } else {
      console.log('  Function not found');
    }

    // 9. check_noob_protection
    console.log('\n--- check_noob_protection ---');
    const cnp = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'check_noob_protection'");
    if (cnp.rows.length > 0) {
      console.log(cnp.rows[0].prosrc.substring(0, 2000));
    }

    console.log('\n✅ Analysis complete');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    clearTimeout(timer);
    await c.end();
  }
}

main();
