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

  // Battle at 11:55 - get combat messages & planet_id
  console.log('=== BATALLA 11:55 GLAZLAN vs ALEJA ===');
  const battle = await c.query(`
    SELECT br.planet_id, br.coordinates, br.rounds, br.report_data
    FROM battle_reports br
    JOIN profiles p1 ON br.attacker_id = p1.id
    JOIN profiles p2 ON br.defender_id = p2.id
    WHERE p1.username = 'Glazlan' AND p2.username = 'Aleja'
      AND br.created_at >= '2026-04-03 11:50'
      AND br.created_at <= '2026-04-03 12:00'
    LIMIT 1
  `);
  
  if (battle.rows.length > 0) {
    const b = battle.rows[0];
    console.log(`  Planet ID: ${b.planet_id}`);
    console.log(`  Coordinates: ${b.coordinates}`);
    console.log(`  Rounds: ${b.rounds}`);
    
    if (b.report_data) {
      const rd = typeof b.report_data === 'string' ? JSON.parse(b.report_data) : b.report_data;
      
      if (rd.initial_attacker) {
        console.log('\n  ATACANTES (initial):');
        const arr = Array.isArray(rd.initial_attacker) ? rd.initial_attacker : [];
        for (const u of arr) {
          console.log(`    - ${u.initial_quantity || u.quantity}x ${u.name} (${u.code}) [source: ${u.source || 'N/A'}]`);
        }
      }
      if (rd.initial_defender) {
        console.log('\n  DEFENSORES (initial):');
        const arr = Array.isArray(rd.initial_defender) ? rd.initial_defender : [];
        for (const u of arr) {
          console.log(`    - ${u.initial_quantity || u.quantity}x ${u.name} (${u.code}) [source: ${u.source || 'N/A'}]`);
        }
      }
      if (rd.attacker_remaining) {
        console.log('\n  ATACANTES (remaining):');
        for (const u of (Array.isArray(rd.attacker_remaining) ? rd.attacker_remaining : [])) {
          if ((u.quantity || 0) > 0) console.log(`    - ${u.quantity}x ${u.name} (${u.code})`);
        }
      }
      if (rd.defender_remaining) {
        console.log('\n  DEFENSORES (remaining):');
        for (const u of (Array.isArray(rd.defender_remaining) ? rd.defender_remaining : [])) {
          if ((u.quantity || 0) > 0) console.log(`    - ${u.quantity}x ${u.name} (${u.code}) [source: ${u.source || 'N/A'}]`);
        }
      }
    } else {
      console.log('  report_data: NULL');
    }
    
    // What planet was attacked?
    if (b.planet_id) {
      const pl = await c.query(`
        SELECT name, galaxy, solar_system, position, planet_type, user_id
        FROM planets WHERE id = $1
      `, [b.planet_id]);
      if (pl.rows.length > 0) {
        console.log(`\n  Planeta atacado: ${pl.rows[0].name} [${pl.rows[0].galaxy}:${pl.rows[0].solar_system}:${pl.rows[0].position}] (${pl.rows[0].planet_type})`);
      }
    }
  }

  // Also check 09:21 battle
  console.log('\n=== BATALLA 09:21 GLAZLAN vs ALEJA ===');
  const battle2 = await c.query(`
    SELECT br.planet_id, br.coordinates, br.rounds, br.report_data
    FROM battle_reports br
    JOIN profiles p1 ON br.attacker_id = p1.id
    JOIN profiles p2 ON br.defender_id = p2.id
    WHERE p1.username = 'Glazlan' AND p2.username = 'Aleja'
      AND br.created_at >= '2026-04-03 09:15'
      AND br.created_at <= '2026-04-03 09:30'
    LIMIT 1
  `);
  if (battle2.rows.length > 0) {
    const b = battle2.rows[0];
    console.log(`  Planet ID: ${b.planet_id}`);
    console.log(`  Coordinates: ${b.coordinates}`);
    console.log(`  Rounds: ${b.rounds}`);
    if (b.report_data) {
      const rd = typeof b.report_data === 'string' ? JSON.parse(b.report_data) : b.report_data;
      if (rd.initial_defender) {
        console.log('  DEFENSORES (initial):');
        for (const u of (Array.isArray(rd.initial_defender) ? rd.initial_defender : [])) {
          console.log(`    - ${u.initial_quantity || u.quantity}x ${u.name} (${u.code}) [source: ${u.source || 'N/A'}]`);
        }
      }
    }
    if (b.planet_id) {
      const pl = await c.query(`
        SELECT name, galaxy, solar_system, position, planet_type FROM planets WHERE id = $1
      `, [b.planet_id]);
      if (pl.rows.length > 0) {
        console.log(`  Planeta: ${pl.rows[0].name} [${pl.rows[0].galaxy}:${pl.rows[0].solar_system}:${pl.rows[0].position}] (${pl.rows[0].planet_type})`);
      }
    }
  }

  // Aleja planets
  console.log('\n=== ALEJA PLANETAS ===');
  const aleja = await c.query(`SELECT id FROM profiles WHERE username = 'Aleja'`);
  if (aleja.rows.length > 0) {
    const planets = await c.query(`
      SELECT id, name, galaxy, solar_system, position, planet_type
      FROM planets WHERE user_id = $1 AND NOT is_destroyed
      ORDER BY galaxy, solar_system, position
    `, [aleja.rows[0].id]);
    for (const p of planets.rows) {
      console.log(`  [${p.galaxy}:${p.solar_system}:${p.position}] ${p.name} (${p.planet_type}) id:${p.id.substring(0,8)}`);
    }
  }

  // Alliance check
  console.log('\n=== ALIANZAS ===');
  const alliances = await c.query(`
    SELECT p.username, a.tag, a.name as alliance_name
    FROM profiles p
    LEFT JOIN alliance_members am ON am.user_id = p.id
    LEFT JOIN alliances a ON a.id = am.alliance_id
    WHERE p.username IN ('Aleja') OR p.username ILIKE 'Lores%'
  `);
  for (const a of alliances.rows) {
    console.log(`  ${a.username}: [${a.tag || 'NINGUNA'}] ${a.alliance_name || ''}`);
  }

  // Deployed fleets at [3:113:2]
  console.log('\n=== FLOTAS DEPLOY [3:113:2] ===');
  const deployed = await c.query(`
    SELECT f.id, p.username, f.arrival_time
    FROM fleets f JOIN profiles p ON f.user_id = p.id
    WHERE f.target_galaxy = 3 AND f.target_system = 113 AND f.target_position = 2
      AND f.mission_type = 'deploy' AND NOT f.is_completed AND NOT f.is_returning
  `);
  for (const f of deployed.rows) {
    console.log(`  ${f.username}: fleet ${f.id.substring(0,8)}, arrived ${f.arrival_time}`);
    const ships = await c.query(`
      SELECT fs.quantity, st.name, st.code
      FROM fleet_ships fs JOIN ship_types st ON fs.ship_type_id = st.id
      WHERE fs.fleet_id = $1 AND fs.quantity > 0
    `, [f.id]);
    for (const s of ships.rows) {
      console.log(`    ${s.quantity}x ${s.name} (${s.code})`);
    }
  }

  // CHECK DEPLOYED PERFORM_COMBAT
  console.log('\n=== PERFORM_COMBAT EN PRODUCCION ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'`);
  if (fn.rows.length > 0) {
    const src = fn.rows[0].prosrc;
    const idx = src.indexOf('ALLIED');
    if (idx >= 0) {
      console.log('  ✅ Sección ALLIED encontrada');
      console.log(src.substring(idx, idx + 600));
    } else {
      console.log('  ❌ NO tiene sección ALLIED');
      console.log('  Has source:', src.includes("'source'"));
      console.log('  Has deploy:', src.includes("'deploy'"));
      console.log('  Length:', src.length);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
