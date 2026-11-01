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

  // 1. Find the specific battle(s) Glazlan vs Aleja today
  console.log('=== BATALLAS GLAZLAN vs ALEJA HOY ===');
  const battles = await c.query(`
    SELECT br.*, 
           p1.username as att_name, p2.username as def_name,
           br.target_galaxy, br.target_system, br.target_position
    FROM battle_reports br
    LEFT JOIN profiles p1 ON br.attacker_id = p1.id
    LEFT JOIN profiles p2 ON br.defender_id = p2.id
    WHERE p1.username ILIKE '%Glazlan%' AND p2.username ILIKE '%Aleja%'
      AND br.created_at >= '2026-04-03'
    ORDER BY br.created_at DESC
  `);
  
  // Check columns first
  if (battles.rows.length > 0) {
    console.log('  Columns:', Object.keys(battles.rows[0]).join(', '));
  }
  
  for (const b of battles.rows) {
    console.log(`\n  [${b.created_at}] ${b.att_name} vs ${b.def_name}: ${b.result}`);
    console.log(`  Target: [${b.target_galaxy || '?'}:${b.target_system || '?'}:${b.target_position || '?'}]`);
    console.log(`  Loot: M:${b.loot_metal} C:${b.loot_crystal} D:${b.loot_deuterium}`);
    console.log(`  Att losses: M:${b.attacker_losses_metal} C:${b.attacker_losses_crystal}`);
    console.log(`  Def losses: M:${b.defender_losses_metal} C:${b.defender_losses_crystal}`);
    
    // Check if it has combat data
    if (b.combat_data) {
      const cd = typeof b.combat_data === 'string' ? JSON.parse(b.combat_data) : b.combat_data;
      console.log(`  Rounds: ${cd.rounds || '?'}`);
      if (cd.initial_attacker) {
        console.log('  Attacker units:');
        for (const u of (Array.isArray(cd.initial_attacker) ? cd.initial_attacker : [])) {
          console.log(`    - ${u.quantity || u.initial_quantity}x ${u.name} (${u.code})`);
        }
      }
      if (cd.initial_defender) {
        console.log('  Defender units (initial):');
        for (const u of (Array.isArray(cd.initial_defender) ? cd.initial_defender : [])) {
          console.log(`    - ${u.quantity || u.initial_quantity}x ${u.name} (${u.code}) [source: ${u.source || 'N/A'}]`);
        }
      }
    }
  }

  // 2. Get the battle report messages for this battle
  console.log('\n=== MENSAJES DE COMBATE GLAZLAN ===');
  const msgs = await c.query(`
    SELECT m.subject, m.body, m.created_at
    FROM messages m
    JOIN profiles p ON m.recipient_id = p.id
    WHERE p.username ILIKE '%Glazlan%'
      AND m.message_type = 'combat_report'
      AND m.created_at >= '2026-04-03'
    ORDER BY m.created_at DESC
    LIMIT 5
  `);
  for (const m of msgs.rows) {
    console.log(`\n  [${m.created_at}] ${m.subject}`);
    if (m.body) {
      // Print first 1000 chars
      console.log(`  ${m.body.substring(0, 1500)}`);
    }
  }

  // 3. Get Aleja's profile and planets
  console.log('\n=== ALEJA INFO ===');
  const aleja = await c.query(`
    SELECT id, username, ranking_position FROM profiles WHERE username ILIKE 'Aleja'
  `);
  if (aleja.rows.length > 0) {
    const alejaId = aleja.rows[0].id;
    console.log(`  ${aleja.rows[0].username} - Rank: ${aleja.rows[0].ranking_position} - ID: ${alejaId.substring(0,8)}`);
    
    // Aleja's planets
    const planets = await c.query(`
      SELECT id, name, galaxy, solar_system, position, planet_type
      FROM planets WHERE user_id = $1 AND NOT is_destroyed
      ORDER BY galaxy, solar_system, position
    `, [alejaId]);
    for (const p of planets.rows) {
      console.log(`  Planet: ${p.name} [${p.galaxy}:${p.solar_system}:${p.position}] (${p.planet_type}) ID:${p.id.substring(0,8)}`);
    }
  }

  // 4. Get Glazlan's profile
  console.log('\n=== GLAZLAN INFO ===');
  const glazlan = await c.query(`
    SELECT id, username, ranking_position FROM profiles WHERE username ILIKE 'Glazlan'
  `);
  if (glazlan.rows.length > 0) {
    console.log(`  ${glazlan.rows[0].username} - Rank: ${glazlan.rows[0].ranking_position}`);
  }

  // 5. Check what Lores' fleets look like deployed at Aleja's planet
  console.log('\n=== FLOTAS DE LORES EN [3:113:2] ===');
  const loresFleets = await c.query(`
    SELECT f.id, f.user_id, p.username, f.arrival_time, f.is_completed, f.is_returning,
           f.target_galaxy, f.target_system, f.target_position
    FROM fleets f
    JOIN profiles p ON f.user_id = p.id
    WHERE f.target_galaxy = 3 AND f.target_system = 113 AND f.target_position = 2
      AND f.mission_type = 'deploy'
      AND f.is_completed = false
      AND f.is_returning = false
    ORDER BY f.arrival_time
  `);
  for (const f of loresFleets.rows) {
    console.log(`\n  Fleet ${f.id.substring(0,8)}: ${f.username} arrived ${f.arrival_time}`);
    const ships = await c.query(`
      SELECT fs.quantity, st.code, st.name
      FROM fleet_ships fs JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = $1
    `, [f.id]);
    for (const s of ships.rows) {
      console.log(`    - ${s.quantity}x ${s.name} (${s.code})`);
    }
  }

  // 6. Alliance check: are Aleja and Lores in same alliance?
  console.log('\n=== ALIANZAS DE ALEJA Y LORES ===');
  const alliances = await c.query(`
    SELECT p.username, am.alliance_id, a.name as alliance_name, a.tag as alliance_tag
    FROM profiles p
    LEFT JOIN alliance_members am ON am.user_id = p.id
    LEFT JOIN alliances a ON a.id = am.alliance_id
    WHERE p.username IN ('Aleja', 'Lores 💀')
       OR p.username ILIKE 'Lores%'
  `);
  for (const a of alliances.rows) {
    console.log(`  ${a.username}: Alliance ${a.alliance_tag || 'NONE'} (${a.alliance_name || 'N/A'})`);
  }

  // 7. Check the deployed perform_combat function for the allied fleet section
  console.log('\n=== PERFORM_COMBAT DESPLEGADO - seccion aliados ===');
  const fn = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'
  `);
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    // Find the allied section
    const allyIdx = src.indexOf('ALLIED');
    if (allyIdx >= 0) {
      console.log('  ✅ Sección ALLIED encontrada en posición:', allyIdx);
      console.log('  Extracto:', src.substring(allyIdx, allyIdx + 500));
    } else {
      console.log('  ❌ NO tiene sección ALLIED - versión vieja deployada!');
      // Show the full function for diagnosis
      console.log('  Function length:', src.length, 'chars');
      // Check what it has
      const hasSource = src.includes("'source'");
      const hasAlly = src.includes('ally') || src.includes('allied');
      console.log('  Has "source":', hasSource);
      console.log('  Has "ally/allied":', hasAlly);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
