const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Find players with Death Stars and their tech levels
  const res = await client.query(`
    SELECT 
      p.username,
      COALESCE(SUM(CASE WHEN st.code = 'deathstar' THEN ps.quantity ELSE 0 END), 0) as deathstars,
      MAX(CASE WHEN tt.code = 'weapons_tech' THEN ut.level ELSE 0 END) as weapon_tech,
      MAX(CASE WHEN tt.code = 'shield_tech' THEN ut.level ELSE 0 END) as shield_tech,
      MAX(CASE WHEN tt.code = 'armour_tech' THEN ut.level ELSE 0 END) as armour_tech
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id
    JOIN planet_ships ps ON ps.planet_id = pl.id
    JOIN ship_types st ON st.id = ps.ship_type_id
    LEFT JOIN user_technologies ut ON ut.user_id = p.id
    LEFT JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE st.code = 'deathstar' AND ps.quantity > 0
    GROUP BY p.id, p.username
    ORDER BY deathstars DESC
  `);
  
  console.log('Players with Death Stars:\n');
  console.log('Username'.padEnd(25), 'DS'.padStart(5), 'Weapon'.padStart(8), 'Shield'.padStart(8), 'Armour'.padStart(8));
  console.log('-'.repeat(60));
  res.rows.forEach(r => {
    console.log(
      r.username.padEnd(25),
      String(r.deathstars).padStart(5),
      String(r.weapon_tech).padStart(8),
      String(r.shield_tech).padStart(8),
      String(r.armour_tech).padStart(8)
    );
  });
  
  // Simulate the math for 35 DS vs 35 DS with various tech combos
  console.log('\n\n=== MATH SIMULATION: 35 DS vs 35 DS ===');
  
  const baseWeapon = 200000;
  const baseShield = 50000;
  const baseHull = 3600000;
  
  // No tech
  let wTech = 0, sTech = 0, aTech = 0;
  let weapon = Math.floor(baseWeapon * (1 + wTech * 0.1));
  let shield = Math.floor(baseShield * (1 + sTech * 0.1));
  let hull = Math.floor(baseHull * (1 + aTech * 0.1));
  
  console.log(`\nScenario 1: No tech (W:0 S:0 A:0)`);
  console.log(`  Weapon: ${weapon}, Shield: ${shield}, Hull: ${hull}`);
  console.log(`  Total firepower 35 DS × 6 rounds: ${35 * weapon * 6}`);
  console.log(`  Damage per shot after shield: ${weapon - shield}`);
  console.log(`  Shots to kill 1 DS: ${Math.ceil(hull / (weapon - shield))}`);
  console.log(`  Max kills from pool model: ~${Math.floor((35 * (weapon - shield) * 6) / hull)}`);
  
  // With tech 10/10/10
  wTech = 10; sTech = 10; aTech = 10;
  weapon = Math.floor(baseWeapon * (1 + wTech * 0.1));
  shield = Math.floor(baseShield * (1 + sTech * 0.1));
  hull = Math.floor(baseHull * (1 + aTech * 0.1));
  
  console.log(`\nScenario 2: Both tech 10/10/10`);
  console.log(`  Weapon: ${weapon}, Shield: ${shield}, Hull: ${hull}`);
  console.log(`  Total firepower: ${35 * weapon * 6}`);
  console.log(`  Damage per shot after shield: ${weapon - shield}`);
  console.log(`  Shots to kill 1 DS: ${Math.ceil(hull / (weapon - shield))}`);
  console.log(`  Max kills from pool model: ~${Math.floor((35 * (weapon - shield) * 6) / hull)}`);
  
  // Attacker tech 15/0/0, defender 0/0/15
  wTech = 15; sTech = 0; aTech = 0;
  weapon = Math.floor(baseWeapon * (1 + wTech * 0.1));
  const defShield = baseShield;
  const defATech = 15;
  const defHull = Math.floor(baseHull * (1 + defATech * 0.1));
  
  console.log(`\nScenario 3: Attacker W:15, Defender A:15`);
  console.log(`  Weapon: ${weapon}, DefShield: ${defShield}, DefHull: ${defHull}`);
  console.log(`  Total firepower: ${35 * weapon * 6}`);
  console.log(`  Damage per shot after shield: ${weapon - defShield}`);
  console.log(`  Shots to kill 1 DS: ${Math.ceil(defHull / (weapon - defShield))}`);
  console.log(`  Max kills from pool model: ~${Math.floor((35 * (weapon - defShield) * 6) / defHull)}`);
  
  // Show what it takes to get 22 kills
  console.log(`\n\n=== REVERSE CALC: What's needed to kill 22 DS? ===`);
  const baseDefHull = 3600000;
  for (let at = 0; at <= 15; at++) {
    const hullWithTech = Math.floor(baseDefHull * (1 + at * 0.1));
    const totalHullNeeded = 22 * hullWithTech;
    // Required total damage (after shields) to kill 22
    console.log(`  DefArmour ${at}: hull=${hullWithTech}, total for 22 kills = ${totalHullNeeded.toLocaleString()}`);
  }
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
