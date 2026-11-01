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

  // 1. Get secure_send_fleet function - the validation part for mission_type and ships
  console.log('=== secure_send_fleet - ship/mission validation ===');
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  
  if (fn.length > 0) {
    const src = fn[0].prosrc;
    
    // Find espionage_probe references
    console.log('\n--- espionage_probe references ---');
    let idx = 0;
    while (true) {
      idx = src.indexOf('espionage_probe', idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 200), Math.min(src.length, idx + 200)));
      idx += 15;
    }

    // Find attack mission validation
    console.log('\n\n--- attack mission validation ---');
    idx = 0;
    while (true) {
      idx = src.indexOf("'attack'", idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 300), Math.min(src.length, idx + 300)));
      idx += 8;
    }

    // Find mission_type validation section
    console.log('\n\n--- mission_type checks ---');
    idx = src.indexOf('mission_type');
    if (idx >= 0) {
      console.log(src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 500)));
    }

    // Show the whole function (it's long, just show the ship validation part)
    console.log('\n\n--- Ship validation / only_probes check ---');
    const probeCheck = src.indexOf('only_probes');
    if (probeCheck >= 0) {
      console.log(src.substring(Math.max(0, probeCheck - 300), Math.min(src.length, probeCheck + 400)));
    } else {
      console.log('No "only_probes" check found');
      // Search for combat ship validation
      const combatIdx = src.indexOf('combat');
      if (combatIdx >= 0) {
        console.log(src.substring(Math.max(0, combatIdx - 200), Math.min(src.length, combatIdx + 400)));
      }
    }
  }

  // 2. Check if there's a separate validation for what ships can do what missions
  console.log('\n\n=== validate_fleet_composition or similar ===');
  const { rows: valFns } = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE (proname LIKE '%validate%fleet%' OR proname LIKE '%fleet%valid%' OR proname LIKE '%validate%ship%')
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY proname
  `);
  for (const f of valFns) {
    console.log(`  ${f.proname}`);
  }

  // 3. Check espionage_probe ship type - is it combat or civil?
  console.log('\n=== espionage_probe ship type ===');
  const { rows: probeType } = await c.query(`
    SELECT code, name, category, weapon_power, shield_power, hull_points 
    FROM ship_types WHERE code = 'espionage_probe'
  `);
  console.log(probeType[0]);

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
