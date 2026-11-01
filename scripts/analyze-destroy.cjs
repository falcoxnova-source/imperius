const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Check for destroy-related functions
  console.log('=== FUNCTIONS with "destroy" in name or source ===');
  const { rows: fns } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE (proname LIKE '%destroy%' OR prosrc LIKE '%destroy%')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of fns) {
    console.log(`  ${f.proname}`);
  }

  // 2. Check process_fleet_arrival for destroy mission handling
  console.log('\n=== process_fleet_arrival - destroy section ===');
  const { rows: arrivalFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'process_fleet_arrival'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (arrivalFn.length > 0) {
    const src = arrivalFn[0].prosrc;
    const idx = src.indexOf("'destroy'");
    if (idx >= 0) {
      console.log(src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 1500)));
    } else {
      console.log('No destroy section found in process_fleet_arrival');
    }
  }

  // 3. Check if there's a dedicated destroy_moon function
  console.log('\n=== destroy_moon or similar functions ===');
  const { rows: moonFns } = await c.query(`
    SELECT proname, prosrc FROM pg_proc 
    WHERE proname LIKE '%moon%destroy%' OR proname LIKE '%destroy%moon%'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  for (const f of moonFns) {
    console.log(`\n--- ${f.proname} ---`);
    console.log(f.prosrc.substring(0, 1000));
  }

  // 4. Check validate_fleet_mission for destroy
  console.log('\n=== validate_fleet_mission - destroy section ===');
  const { rows: valFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (valFn.length > 0) {
    const src = valFn[0].prosrc;
    if (src.includes('destroy')) {
      // Find destroy references
      let idx = 0;
      while (true) {
        idx = src.indexOf('destroy', idx);
        if (idx === -1) break;
        console.log(src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 200)));
        console.log('---');
        idx += 7;
      }
    } else {
      console.log('No destroy references in validate_fleet_mission');
    }
  }

  // 5. Check secure_send_fleet for destroy mission
  console.log('\n=== secure_send_fleet - destroy handling ===');
  const { rows: sendFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (sendFn.length > 0) {
    const src = sendFn[0].prosrc;
    const hasDestroy = src.includes('destroy');
    console.log('Has destroy in secure_send_fleet:', hasDestroy);
    
    // Check mission_type validation
    const missionCheck = src.indexOf('p_mission_type NOT IN');
    if (missionCheck >= 0) {
      console.log('Mission types allowed:', src.substring(missionCheck, missionCheck + 200));
    }
  }

  // 6. Check deathstar ship
  console.log('\n=== Deathstar ship (Estrella de la Muerte) ===');
  const { rows: ds } = await c.query(`
    SELECT code, name, weapon_power, shield_power, structural_integrity 
    FROM ship_types WHERE code IN ('deathstar', 'death_star', 'estrella_muerte')
  `);
  console.log(ds);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
