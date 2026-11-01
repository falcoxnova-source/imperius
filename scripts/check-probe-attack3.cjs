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

  // Get FULL validate_fleet_mission - looking for the ATTACK section specifically
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  
  if (fn.length > 0) {
    const src = fn[0].prosrc;
    
    // Find the ATTACK section
    console.log('=== ATTACK MISSION section in validate_fleet_mission ===');
    const attackIdx = src.indexOf("'attack'");
    let sectionStart = attackIdx;
    // Look backwards for the section comment
    const commentIdx = src.lastIndexOf('===', attackIdx);
    if (commentIdx >= 0 && attackIdx - commentIdx < 200) {
      sectionStart = src.lastIndexOf('\n', commentIdx);
    }
    console.log(src.substring(Math.max(0, sectionStart), Math.min(src.length, sectionStart + 1500)));

    // Check if there's ANY probe-specific check for attack
    console.log('\n\n=== All "espionage" references ===');
    let idx = 0;
    while (true) {
      idx = src.indexOf('espionage', idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 200)));
      idx += 9;
    }

    // Check if there's a "probe only" restriction anywhere  
    console.log('\n\n=== "probe" references ===');
    idx = 0;
    while (true) {
      idx = src.indexOf('probe', idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 100), Math.min(src.length, idx + 200)));
      idx += 5;
    }
  }

  // Also check secure_send_fleet for the attack section
  console.log('\n\n=== secure_send_fleet - ATTACK specific checks ===');
  const { rows: sendFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (sendFn.length > 0) {
    const src = sendFn[0].prosrc;
    
    // Find mission_type = 'attack' checks
    let idx = 0;
    while (true) {
      idx = src.indexOf("'attack'", idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 300), Math.min(src.length, idx + 300)));
      idx += 8;
    }
    
    // Check if there's espionage_probe referenced in attack context
    console.log('\n--- espionage_probe in secure_send_fleet ---');
    idx = 0;
    while (true) {
      idx = src.indexOf('espionage', idx);
      if (idx === -1) break;
      console.log(`\n[pos ${idx}]:`, src.substring(Math.max(0, idx - 150), Math.min(src.length, idx + 150)));
      idx += 9;
    }
  }

  // Check the frontend - FleetPage validation
  console.log('\n\n=== Frontend fleet mission validation ===');
  // Will check this separately

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
