const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  // 1. Check accelerate_fleet still calls calculate_fxu_cost_fleet
  const accel = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'accelerate_fleet' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (accel.rows.length > 0) {
    const def = accel.rows[0].def;
    console.log('=== accelerate_fleet ===');
    console.log('Calls calculate_fxu_cost_fleet:', def.includes('calculate_fxu_cost_fleet'));
    console.log('Touches flight time:', def.includes('flight_time') || def.includes('arrival_time') || def.includes('return_time'));
    console.log('Touches fleet speed:', def.includes('fleet_speed') || def.includes('flight_speed'));
    // Show relevant part
    const lines = def.split('\n');
    const costLine = lines.findIndex(l => l.includes('calculate_fxu_cost_fleet'));
    if (costLine >= 0) {
      console.log('\nContext around calculate_fxu_cost_fleet call:');
      for (let i = Math.max(0, costLine - 3); i <= Math.min(lines.length - 1, costLine + 15); i++) {
        console.log(`  ${lines[i]}`);
      }
    }
  } else {
    console.log('[NOT FOUND] accelerate_fleet');
  }

  // 2. Verify fleet_calc_flight_time is UNTOUCHED (no is_user_plus references)
  const flightTime = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'fleet_calc_flight_time' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (flightTime.rows.length > 0) {
    const def = flightTime.rows[0].def;
    console.log('\n=== fleet_calc_flight_time ===');
    console.log('Contains is_user_plus:', def.includes('is_user_plus'));
    console.log('Contains VIP:', def.includes('VIP') || def.includes('vip'));
    console.log('Contains plus:', def.includes('plus') || def.includes('Plus'));
    console.log('STATUS: ' + (!def.includes('is_user_plus') && !def.includes('VIP') ? 'CLEAN (no VIP modifications)' : 'WARNING: VIP REFERENCES FOUND'));
  }

  // 3. Verify secure_send_fleet is UNTOUCHED
  const sendFleet = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'secure_send_fleet' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (sendFleet.rows.length > 0) {
    const def = sendFleet.rows[0].def;
    console.log('\n=== secure_send_fleet ===');
    console.log('Contains is_user_plus:', def.includes('is_user_plus'));
    console.log('Contains VIP:', def.includes('VIP') || def.includes('vip'));
    console.log('STATUS: ' + (!def.includes('is_user_plus') ? 'CLEAN (no VIP modifications)' : 'WARNING: VIP REFERENCES FOUND'));
  }

  // 4. Verify process_fleet_arrival is UNTOUCHED
  const fleetArr = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'process_fleet_arrival' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (fleetArr.rows.length > 0) {
    const def = fleetArr.rows[0].def;
    console.log('\n=== process_fleet_arrival ===');
    console.log('Contains is_user_plus:', def.includes('is_user_plus'));
    console.log('STATUS: ' + (!def.includes('is_user_plus') ? 'CLEAN (no VIP modifications)' : 'WARNING: VIP REFERENCES FOUND'));
  }

  // 5. Verify process_combat is UNTOUCHED
  const combat = await client.query(
    `SELECT pg_get_functiondef(oid) as def 
     FROM pg_proc 
     WHERE proname = 'process_combat' 
     AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`
  );
  if (combat.rows.length > 0) {
    const def = combat.rows[0].def;
    console.log('\n=== process_combat ===');
    console.log('Contains is_user_plus:', def.includes('is_user_plus'));
    console.log('STATUS: ' + (!def.includes('is_user_plus') ? 'CLEAN (no VIP modifications)' : 'WARNING: VIP REFERENCES FOUND'));
  }

  // 6. Check instant_complete functions still call the updated cost functions
  const instantFns = ['instant_complete_building', 'instant_complete_research', 'instant_complete_shipyard'];
  for (const fn of instantFns) {
    const r = await client.query(
      `SELECT pg_get_functiondef(oid) as def 
       FROM pg_proc 
       WHERE proname = $1 
       AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
      [fn]
    );
    if (r.rows.length > 0) {
      const def = r.rows[0].def;
      const costFn = fn.replace('instant_complete_', 'calculate_fxu_cost_');
      console.log(`\n=== ${fn} ===`);
      console.log(`Calls ${costFn}: ${def.includes(costFn)}`);
    }
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
