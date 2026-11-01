const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  console.log('✅ Conectado\n');

  // 1. Perfil actual
  console.log('========== 1. PERFIL MARINA AR72 ==========');
  const prof = await c.query(`
    SELECT id, username, points_total, points_buildings, points_research, points_fleet, points_defense,
           rank_position, created_at
    FROM profiles WHERE username = 'MarinaAR72'
  `);
  const marina = prof.rows[0];
  console.log('  ID:', marina.id);
  console.log('  Puntos Total:', marina.points_total);
  console.log('  Puntos Buildings:', marina.points_buildings);
  console.log('  Puntos Research:', marina.points_research);
  console.log('  Puntos Fleet:', marina.points_fleet);
  console.log('  Puntos Defense:', marina.points_defense);
  console.log('  Rank:', marina.rank_position);
  console.log('  Creado:', marina.created_at);

  // 2. Planetas
  console.log('\n========== 2. PLANETAS ==========');
  const planets = await c.query(`
    SELECT p.id, p.name, p.galaxy, p.solar_system, p.position, p.planet_type, p.fields_used, p.fields_max
    FROM planets p WHERE p.user_id = $1 ORDER BY p.galaxy, p.solar_system, p.position
  `, [marina.id]);
  console.table(planets.rows.map(r => ({
    name: r.name, pos: `${r.galaxy}:${r.solar_system}:${r.position}`, type: r.planet_type,
    fields: `${r.fields_used}/${r.fields_max}`
  })));

  // 3. Edificios por planeta (los que dan más puntos)
  console.log('\n========== 3. EDIFICIOS POR PLANETA ==========');
  for (const pl of planets.rows) {
    const blds = await c.query(`
      SELECT bt.code, bt.name, pb.level,
             FLOOR(bt.base_metal * (POWER(bt.cost_factor, pb.level) - 1) / (bt.cost_factor - 1)) +
             FLOOR(bt.base_crystal * (POWER(bt.cost_factor, pb.level) - 1) / (bt.cost_factor - 1)) +
             FLOOR(bt.base_deuterium * (POWER(bt.cost_factor, pb.level) - 1) / (bt.cost_factor - 1)) as total_invested
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = $1 AND pb.level > 0
      ORDER BY pb.level DESC
    `, [pl.id]);
    console.log(`\n  --- ${pl.name} [${pl.galaxy}:${pl.solar_system}:${pl.position}] ---`);
    console.table(blds.rows.map(r => ({ building: r.code, level: r.level, invested: Number(r.total_invested).toLocaleString() })));
  }

  // 4. Investigaciones
  console.log('\n========== 4. INVESTIGACIONES ==========');
  const techs = await c.query(`
    SELECT tt.code, tt.name, ur.level
    FROM user_technologies ur
    JOIN technology_types tt ON tt.id = ur.technology_type_id
    WHERE ur.user_id = $1 AND ur.level > 0
    ORDER BY ur.level DESC
  `, [marina.id]);
  console.table(techs.rows.map(r => ({ tech: r.code, name: r.name, level: r.level })));

  // 5. Naves por planeta
  console.log('\n========== 5. NAVES POR PLANETA ==========');
  for (const pl of planets.rows) {
    const ships = await c.query(`
      SELECT st.code, st.name, ps.quantity,
             ps.quantity * (st.metal_cost + st.crystal_cost + st.deuterium_cost) as total_cost
      FROM planet_ships ps
      JOIN ship_types st ON st.id = ps.ship_type_id
      WHERE ps.planet_id = $1 AND ps.quantity > 0
      ORDER BY total_cost DESC
    `, [pl.id]);
    if (ships.rows.length > 0) {
      console.log(`\n  --- ${pl.name} [${pl.galaxy}:${pl.solar_system}:${pl.position}] ---`);
      console.table(ships.rows.map(r => ({ ship: r.code, qty: r.quantity, cost: Number(r.total_cost).toLocaleString() })));
    }
  }

  // 6. Defensas por planeta
  console.log('\n========== 6. DEFENSAS POR PLANETA ==========');
  for (const pl of planets.rows) {
    const defs = await c.query(`
      SELECT dt.code, dt.name, pd.quantity,
             pd.quantity * (dt.metal_cost + dt.crystal_cost + dt.deuterium_cost) as total_cost
      FROM planet_defenses pd
      JOIN defense_types dt ON dt.id = pd.defense_type_id
      WHERE pd.planet_id = $1 AND pd.quantity > 0
      ORDER BY total_cost DESC
    `, [pl.id]);
    if (defs.rows.length > 0) {
      console.log(`\n  --- ${pl.name} [${pl.galaxy}:${pl.solar_system}:${pl.position}] ---`);
      console.table(defs.rows.map(r => ({ defense: r.code, qty: r.quantity, cost: Number(r.total_cost).toLocaleString() })));
    }
  }

  // 7. Flotas activas
  console.log('\n========== 7. FLOTAS ACTIVAS ==========');
  const fleets = await c.query(`
    SELECT f.mission_type, f.status,
           op.galaxy as og, op.solar_system as os, op.position as opos,
           dp.galaxy as dg, dp.solar_system as ds, dp.position as dpos,
           f.departure_time, f.arrival_time,
           f.metal_cargo, f.crystal_cargo, f.deuterium_cargo
    FROM fleets f
    LEFT JOIN planets op ON op.id = f.origin_planet_id
    LEFT JOIN planets dp ON dp.id = f.destination_planet_id
    WHERE f.user_id = $1
    ORDER BY f.departure_time DESC
    LIMIT 20
  `, [marina.id]);
  if (fleets.rows.length > 0) {
    console.table(fleets.rows.map(r => ({
      mission: r.mission_type, status: r.status,
      from: `${r.og}:${r.os}:${r.opos}`, to: `${r.dg}:${r.ds}:${r.dpos}`,
      metal: r.metal_cargo, crystal: r.crystal_cargo, deut: r.deuterium_cargo
    })));
  } else {
    console.log('  No hay flotas activas');
  }

  // 8. Batallas recientes
  console.log('\n========== 8. BATALLAS RECIENTES ==========');
  const battles = await c.query(`
    SELECT m.subject, m.created_at, m.is_read,
           LEFT(m.body::text, 200) as body_preview
    FROM messages m
    WHERE m.recipient_id = $1 AND m.message_type IN ('battle_report','combat_report','espionage')
    ORDER BY m.created_at DESC
    LIMIT 10
  `, [marina.id]);
  if (battles.rows.length > 0) {
    for (const b of battles.rows) {
      console.log(`  [${b.created_at?.toISOString?.()?.slice(0,16)}] ${b.subject}`);
      console.log(`    ${b.body_preview}`);
    }
  } else {
    console.log('  No hay reportes de batalla');
  }

  // 9. Cola de construcción activa
  console.log('\n========== 9. COLAS ACTIVAS ==========');
  const queues = await c.query(`
    SELECT bt.code, bq.target_level, bq.start_time, bq.end_time, pl.name
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE pl.user_id = $1
    ORDER BY bq.end_time
  `, [marina.id]);
  if (queues.rows.length > 0) {
    console.table(queues.rows.map(r => ({ planet: r.name, building: r.code, lvl: r.target_level, end: r.end_time })));
  } else {
    console.log('  Sin colas de construcción');
  }

  const rq = await c.query(`
    SELECT tt.code, rq.target_level, rq.start_time, rq.end_time
    FROM research_queue rq
    JOIN technology_types tt ON tt.id = rq.technology_type_id
    WHERE rq.user_id = $1
    ORDER BY rq.end_time
  `, [marina.id]);
  if (rq.rows.length > 0) {
    console.table(rq.rows.map(r => ({ tech: r.code, lvl: r.target_level, end: r.end_time })));
  }

  await c.end();
  console.log('\n✅ Auditoría completa');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
