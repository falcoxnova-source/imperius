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

  // Check battle_reports columns
  console.log('=== COLUMNAS battle_reports ===');
  const cols = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'battle_reports' ORDER BY ordinal_position
  `);
  for (const col of cols.rows) {
    console.log(`  ${col.column_name}: ${col.data_type}`);
  }

  // Get the specific battle
  console.log('\n=== BATALLAS GLAZLAN vs ALEJA HOY ===');
  const battles = await c.query(`
    SELECT br.id, br.attacker_id, br.defender_id, br.result, br.created_at,
           br.loot_metal, br.loot_crystal, br.loot_deuterium,
           br.attacker_losses_metal, br.attacker_losses_crystal,
           br.defender_losses_metal, br.defender_losses_crystal,
           p1.username as att_name, p2.username as def_name
    FROM battle_reports br
    JOIN profiles p1 ON br.attacker_id = p1.id
    JOIN profiles p2 ON br.defender_id = p2.id
    WHERE p1.username ILIKE '%Glazlan%' AND p2.username ILIKE '%Aleja%'
      AND br.created_at >= '2026-04-03'
    ORDER BY br.created_at DESC
  `);
  
  for (const b of battles.rows) {
    console.log(`\n  [${b.created_at}] ${b.att_name} vs ${b.def_name}: ${b.result}`);
    console.log(`  Loot: M:${b.loot_metal} C:${b.loot_crystal} D:${b.loot_deuterium}`);
    console.log(`  Att losses: M:${b.attacker_losses_metal} C:${b.attacker_losses_crystal}`);
    console.log(`  Def losses: M:${b.defender_losses_metal} C:${b.defender_losses_crystal}`);
    
    // Read the combat report message for this battle
    const msgs = await c.query(`
      SELECT body FROM messages 
      WHERE recipient_id = $1 AND message_type = 'combat_report'
        AND created_at BETWEEN $2::timestamptz - interval '2 minutes' AND $2::timestamptz + interval '2 minutes'
      LIMIT 1
    `, [b.attacker_id, b.created_at]);
    if (msgs.rows.length > 0 && msgs.rows[0].body) {
      console.log(`  Report (first 2000 chars): ${msgs.rows[0].body.substring(0, 2000)}`);
    }
  }

  // Aleja info
  console.log('\n=== ALEJA INFO ===');
  const aleja = await c.query(`SELECT id, username, ranking_position FROM profiles WHERE username = 'Aleja'`);
  if (aleja.rows.length > 0) {
    const alejaId = aleja.rows[0].id;
    console.log(`  ${aleja.rows[0].username} - Rank: ${aleja.rows[0].ranking_position}`);
    
    const planets = await c.query(`
      SELECT id, name, galaxy, solar_system, position, planet_type
      FROM planets WHERE user_id = $1 AND NOT is_destroyed
      ORDER BY galaxy, solar_system, position
    `, [alejaId]);
    for (const p of planets.rows) {
      console.log(`  [${p.galaxy}:${p.solar_system}:${p.position}] ${p.name} (${p.planet_type})`);
    }
  }

  // Glazlan info
  console.log('\n=== GLAZLAN INFO ===');
  const glazlan = await c.query(`SELECT id, username, ranking_position FROM profiles WHERE username = 'Glazlan'`);
  if (glazlan.rows.length > 0) {
    console.log(`  ${glazlan.rows[0].username} - Rank: ${glazlan.rows[0].ranking_position}`);
  }

  // Check alliances
  console.log('\n=== ALIANZAS ===');
  const alliances = await c.query(`
    SELECT p.username, am.alliance_id, a.name as alliance_name, a.tag as alliance_tag
    FROM profiles p
    LEFT JOIN alliance_members am ON am.user_id = p.id
    LEFT JOIN alliances a ON a.id = am.alliance_id
    WHERE p.username IN ('Aleja')
       OR p.username ILIKE 'Lores%'
  `);
  for (const a of alliances.rows) {
    console.log(`  ${a.username}: [${a.alliance_tag || 'NINGUNA'}] ${a.alliance_name || 'N/A'}`);
  }

  // Check Lores' deployed fleets at Aleja's coords
  console.log('\n=== FLOTAS DEPLOY EN [3:113:2] (activas) ===');
  const deployed = await c.query(`
    SELECT f.id, f.user_id, p.username, f.arrival_time, f.mission_type,
           f.is_completed, f.is_returning
    FROM fleets f
    JOIN profiles p ON f.user_id = p.id
    WHERE f.target_galaxy = 3 AND f.target_system = 113 AND f.target_position = 2
      AND f.mission_type = 'deploy'
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY f.arrival_time
  `);
  for (const f of deployed.rows) {
    console.log(`\n  Fleet ${f.id.substring(0,8)}: ${f.username} arrived ${f.arrival_time}`);
    const ships = await c.query(`
      SELECT fs.quantity, st.code, st.name
      FROM fleet_ships fs JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = $1 AND fs.quantity > 0
    `, [f.id]);
    for (const s of ships.rows) {
      console.log(`    - ${s.quantity}x ${s.name} (${s.code})`);
    }
  }

  // 7. Check the deployed perform_combat function
  console.log('\n=== PERFORM_COMBAT DESPLEGADO ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'`);
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    const allyIdx = src.indexOf('ALLIED');
    if (allyIdx >= 0) {
      console.log('  ✅ Sección ALLIED encontrada');
      // Print the ally query conditions
      const snippet = src.substring(allyIdx, Math.min(allyIdx + 800, src.length));
      console.log(snippet);
    } else {
      console.log('  ❌ NO tiene sección ALLIED');
      // Check for other ally-related keywords
      console.log('  Has "source":', src.includes("'source'"));
      console.log('  Has "allied":', src.includes('allied'));
      console.log('  Has "deploy":', src.includes('deploy'));
      console.log('  Function length:', src.length);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
