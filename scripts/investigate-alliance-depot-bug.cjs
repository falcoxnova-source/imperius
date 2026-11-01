const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // 1. Find the specific battle: 22 DDE (star destroyers) attacking
  console.log('=== BUSCAR REPORTES DE COMBATE RECIENTES CON DDE (Destructor de Estrellas) ===');
  
  // First, find the ship code for "destructor de estrellas" and "estrella de la muerte"
  const ships = await c.query(`
    SELECT id, code, name, weapon_power, shield_power, structural_integrity, rapid_fire
    FROM ship_types 
    WHERE code IN ('deathstar', 'destroyer', 'battlecruiser', 'star_destroyer')
       OR name ILIKE '%destructor%' OR name ILIKE '%muerte%' OR name ILIKE '%estrella%'
    ORDER BY id
  `);
  console.log('Naves relevantes:');
  for (const s of ships.rows) {
    console.log(`  ${s.code} (id:${s.id}): ${s.name} - W:${s.weapon_power} S:${s.shield_power} H:${s.structural_integrity}`);
    if (s.rapid_fire) console.log(`    Rapid fire: ${JSON.stringify(s.rapid_fire)}`);
  }

  // 2. Find all battle reports from today involving these ships
  console.log('\n=== REPORTES DE COMBATE HOY (3 abril 2026) ===');
  const reports = await c.query(`
    SELECT m.id, m.sender_id, m.recipient_id, m.subject, m.body, m.created_at,
           p1.username as sender_name, p2.username as recipient_name
    FROM messages m
    LEFT JOIN profiles p1 ON m.sender_id = p1.id
    LEFT JOIN profiles p2 ON m.recipient_id = p2.id
    WHERE m.message_type = 'combat_report'
      AND m.created_at >= '2026-04-03 00:00:00'
    ORDER BY m.created_at DESC
    LIMIT 20
  `);
  
  for (const r of reports.rows) {
    const bodyPreview = r.body ? r.body.substring(0, 300) : 'null';
    console.log(`\n  [${r.created_at}] ${r.sender_name || 'System'} → ${r.recipient_name}`);
    console.log(`  Subject: ${r.subject}`);
    console.log(`  Body preview: ${bodyPreview}...`);
  }

  // Also check battle_reports table if exists
  console.log('\n=== BATTLE_REPORTS TABLE ===');
  try {
    const br = await c.query(`
      SELECT br.id, br.attacker_id, br.defender_id, br.result, br.created_at,
             p1.username as attacker_name, p2.username as defender_name,
             br.attacker_losses_metal, br.defender_losses_metal,
             br.loot_metal, br.loot_crystal, br.loot_deuterium
      FROM battle_reports br
      LEFT JOIN profiles p1 ON br.attacker_id = p1.id
      LEFT JOIN profiles p2 ON br.defender_id = p2.id
      WHERE br.created_at >= '2026-04-03 00:00:00'
      ORDER BY br.created_at DESC
      LIMIT 20
    `);
    for (const r of br.rows) {
      console.log(`  [${r.created_at}] ${r.attacker_name} vs ${r.defender_name}: ${r.result}`);
      console.log(`    Loot: M:${r.loot_metal} C:${r.loot_crystal} D:${r.loot_deuterium}`);
      console.log(`    Losses: Att:${r.attacker_losses_metal} Def:${r.defender_losses_metal}`);
    }
  } catch(e) {
    console.log('  Table not found:', e.message.substring(0, 100));
  }

  // 3. Find deployed allied fleets (currently stationed on ally planets)
  console.log('\n=== FLOTAS ALIADAS ESTACIONADAS (deploy activo) ===');
  const deployedFleets = await c.query(`
    SELECT f.id, f.user_id, p.username, f.mission_type, 
           f.target_galaxy, f.target_system, f.target_position,
           f.arrival_time, f.is_completed, f.is_returning,
           f.origin_planet_id
    FROM fleets f
    JOIN profiles p ON f.user_id = p.id
    WHERE f.mission_type = 'deploy'
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY f.arrival_time DESC
  `);
  
  for (const f of deployedFleets.rows) {
    console.log(`\n  Fleet ${f.id.substring(0,8)}: ${f.username} → [${f.target_galaxy}:${f.target_system}:${f.target_position}]`);
    console.log(`    arrival: ${f.arrival_time}, completed: ${f.is_completed}, returning: ${f.is_returning}`);
    
    // Get ships in this fleet
    const fships = await c.query(`
      SELECT fs.quantity, st.code, st.name
      FROM fleet_ships fs
      JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = $1 AND fs.quantity > 0
    `, [f.id]);
    for (const s of fships.rows) {
      console.log(`    - ${s.quantity}x ${s.name} (${s.code})`);
    }
    
    // Check what planet is at those coords
    const tp = await c.query(`
      SELECT pl.id, pl.name, pl.user_id, pr.username
      FROM planets pl
      LEFT JOIN profiles pr ON pl.user_id = pr.id
      WHERE pl.galaxy = $1 AND pl.solar_system = $2 AND pl.position = $3
        AND pl.planet_type = 'planet' AND NOT pl.is_destroyed
    `, [f.target_galaxy, f.target_system, f.target_position]);
    if (tp.rows.length > 0) {
      console.log(`    Planet: ${tp.rows[0].name} (${tp.rows[0].username})`);
    }
  }

  // 4. Check if "Emanuel Alejandro" is a player - find their profile
  console.log('\n=== BUSCAR JUGADOR AFECTADO ===');
  const players = await c.query(`
    SELECT id, username, points, ranking_position
    FROM profiles 
    WHERE username ILIKE '%emanuel%' OR username ILIKE '%alejandro%'
    LIMIT 5
  `);
  for (const p of players.rows) {
    console.log(`  ${p.username} (rank: ${p.ranking_position}, points: ${p.points})`);
  }
  
  // Also search by rank 113 (the defender)
  const r113 = await c.query(`
    SELECT id, username, points, ranking_position FROM profiles WHERE ranking_position = 113
  `);
  console.log('\n  Rank 113:', r113.rows.length > 0 ? `${r113.rows[0].username} (${r113.rows[0].id.substring(0,8)})` : 'no encontrado');
  
  const r39 = await c.query(`
    SELECT id, username, points, ranking_position FROM profiles WHERE ranking_position = 39
  `);
  console.log('  Rank 39:', r39.rows.length > 0 ? `${r39.rows[0].username} (${r39.rows[0].id.substring(0,8)})` : 'no encontrado');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
