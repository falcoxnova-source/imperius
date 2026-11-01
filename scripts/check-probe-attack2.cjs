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

  // 1. espionage_probe stats
  console.log('=== espionage_probe ship ===');
  const { rows: probe } = await c.query(`SELECT * FROM ship_types WHERE code = 'espionage_probe'`);
  console.log(JSON.stringify(probe[0], null, 2));

  // 2. Full secure_send_fleet - the attack validation part
  console.log('\n=== secure_send_fleet - FULL attack/ship validation section ===');
  const { rows: fn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  
  if (fn.length > 0) {
    const src = fn[0].prosrc;
    
    // Check if there's any "attack" + probe restriction
    const attackSection = src.indexOf("p_mission_type = 'attack'");
    if (attackSection >= 0) {
      console.log('Found attack-specific section at pos', attackSection);
      console.log(src.substring(Math.max(0, attackSection - 100), Math.min(src.length, attackSection + 800)));
    }
    
    // Check if there's a "only combat ships" or "require combat ship" check for attack
    console.log('\n--- Searching for combat ship requirement for attack ---');
    const combatReq = src.indexOf('combat_ship');
    const hasCombat = src.indexOf('has_combat');
    const onlyProbes = src.indexOf('only_probe');
    console.log(`  combat_ship at: ${combatReq}`);
    console.log(`  has_combat at: ${hasCombat}`);
    console.log(`  only_probe at: ${onlyProbes}`);
    
    // Check for any "require at least one combat ship" logic
    const weaponCheck = src.indexOf('weapon');
    if (weaponCheck >= 0) {
      console.log('\n--- weapon reference ---');
      console.log(src.substring(Math.max(0, weaponCheck - 200), Math.min(src.length, weaponCheck + 300)));
    }
    
    // Show the full ship loop/validation
    console.log('\n--- Full ship processing loop ---');
    const shipLoop = src.indexOf('p_fleet_ships');
    if (shipLoop >= 0) {
      // Find the FOR loop that processes ships
      const forIdx = src.indexOf('FOR ', shipLoop);
      if (forIdx >= 0) {
        console.log(src.substring(forIdx, Math.min(src.length, forIdx + 1500)));
      }
    }
  }

  // 3. validate_fleet_mission function  
  console.log('\n\n=== validate_fleet_mission ===');
  const { rows: valFn } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'validate_fleet_mission'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);
  if (valFn.length > 0) {
    console.log(valFn[0].prosrc.substring(0, 3000));
  }

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
