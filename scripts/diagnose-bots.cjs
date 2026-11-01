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
  console.log('='.repeat(80));
  console.log('  DIAGNÓSTICO COMPLETO DE BOTS NPC');
  console.log('  Fecha: ' + new Date().toISOString());
  console.log('='.repeat(80));

  // 1. Puntos de los bots
  console.log('\n📊 1. PUNTOS DE CADA BOT:');
  const points = await client.query(`
    SELECT username, points_total, points_buildings, points_research, points_fleet, points_defense
    FROM profiles WHERE is_bot = true
    ORDER BY points_total DESC
  `);
  console.table(points.rows);

  // 2. Edificios promedio por bot
  console.log('\n🏗️ 2. EDIFICIOS CLAVE (nivel promedio por bot):');
  const buildings = await client.query(`
    SELECT 
      pr.username,
      MAX(CASE WHEN bt.code='metal_mine' THEN pb.level END) AS metal_mine,
      MAX(CASE WHEN bt.code='crystal_mine' THEN pb.level END) AS crystal_mine,
      MAX(CASE WHEN bt.code='solar_plant' THEN pb.level END) AS solar_plant,
      MAX(CASE WHEN bt.code='deuterium_synthesizer' THEN pb.level END) AS deut_synth,
      MAX(CASE WHEN bt.code='robotics_factory' THEN pb.level END) AS robotics,
      MAX(CASE WHEN bt.code='shipyard' THEN pb.level END) AS shipyard,
      MAX(CASE WHEN bt.code='research_lab' THEN pb.level END) AS research_lab
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id AND p.planet_type='planet' AND NOT p.is_destroyed
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
    LEFT JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pr.is_bot = true
    GROUP BY pr.username
    ORDER BY pr.username
  `);
  console.table(buildings.rows);

  // 3. Investigaciones
  console.log('\n🔬 3. INVESTIGACIONES POR BOT:');
  const research = await client.query(`
    SELECT 
      pr.username,
      MAX(CASE WHEN tt.code='energy_tech' THEN ut.level END) AS energy,
      MAX(CASE WHEN tt.code='combustion_drive' THEN ut.level END) AS combustion,
      MAX(CASE WHEN tt.code='espionage_tech' THEN ut.level END) AS espionage,
      MAX(CASE WHEN tt.code='computer_tech' THEN ut.level END) AS computer,
      MAX(CASE WHEN tt.code='impulse_drive' THEN ut.level END) AS impulse,
      MAX(CASE WHEN tt.code='astrophysics' THEN ut.level END) AS astro,
      MAX(CASE WHEN tt.code='weapons_tech' THEN ut.level END) AS weapons,
      MAX(CASE WHEN tt.code='shielding_tech' THEN ut.level END) AS shields,
      MAX(CASE WHEN tt.code='armour_tech' THEN ut.level END) AS armour
    FROM profiles pr
    LEFT JOIN user_technologies ut ON ut.user_id = pr.id
    LEFT JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE pr.is_bot = true
    GROUP BY pr.username
    ORDER BY pr.username
  `);
  console.table(research.rows);

  // 4. Naves por bot
  console.log('\n🚀 4. NAVES TOTALES POR BOT:');
  const ships = await client.query(`
    SELECT 
      pr.username,
      SUM(CASE WHEN st.code='light_fighter' THEN ps.quantity ELSE 0 END) AS lf,
      SUM(CASE WHEN st.code='heavy_fighter' THEN ps.quantity ELSE 0 END) AS hf,
      SUM(CASE WHEN st.code='cruiser' THEN ps.quantity ELSE 0 END) AS cruiser,
      SUM(CASE WHEN st.code='battleship' THEN ps.quantity ELSE 0 END) AS bs,
      SUM(CASE WHEN st.code='small_cargo' THEN ps.quantity ELSE 0 END) AS sc,
      SUM(CASE WHEN st.code='large_cargo' THEN ps.quantity ELSE 0 END) AS lc,
      SUM(CASE WHEN st.code='recycler' THEN ps.quantity ELSE 0 END) AS recycler,
      SUM(CASE WHEN st.code='espionage_probe' THEN ps.quantity ELSE 0 END) AS probe,
      SUM(CASE WHEN st.code='colony_ship' THEN ps.quantity ELSE 0 END) AS colony
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id AND p.planet_type='planet' AND NOT p.is_destroyed
    LEFT JOIN planet_ships ps ON ps.planet_id = p.id
    LEFT JOIN ship_types st ON st.id = ps.ship_type_id
    WHERE pr.is_bot = true
    GROUP BY pr.username
    ORDER BY pr.username
  `);
  console.table(ships.rows);

  // 5. Defensas por bot
  console.log('\n🛡️ 5. DEFENSAS TOTALES POR BOT:');
  const defenses = await client.query(`
    SELECT 
      pr.username,
      SUM(CASE WHEN dt.code='rocket_launcher' THEN pd.quantity ELSE 0 END) AS rockets,
      SUM(CASE WHEN dt.code='light_laser' THEN pd.quantity ELSE 0 END) AS ll,
      SUM(CASE WHEN dt.code='heavy_laser' THEN pd.quantity ELSE 0 END) AS hl,
      SUM(CASE WHEN dt.code='gauss_cannon' THEN pd.quantity ELSE 0 END) AS gauss,
      SUM(CASE WHEN dt.code='ion_cannon' THEN pd.quantity ELSE 0 END) AS ion,
      SUM(CASE WHEN dt.code='plasma_turret' THEN pd.quantity ELSE 0 END) AS plasma,
      SUM(CASE WHEN dt.code='small_shield_dome' THEN pd.quantity ELSE 0 END) AS ssd,
      SUM(CASE WHEN dt.code='large_shield_dome' THEN pd.quantity ELSE 0 END) AS lsd
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id AND p.planet_type='planet' AND NOT p.is_destroyed
    LEFT JOIN planet_defenses pd ON pd.planet_id = p.id
    LEFT JOIN defense_types dt ON dt.id = pd.defense_type_id
    WHERE pr.is_bot = true
    GROUP BY pr.username
    ORDER BY pr.username
  `);
  console.table(defenses.rows);

  // 6. Planetas (colonias)
  console.log('\n🌍 6. PLANETAS POR BOT:');
  const planets = await client.query(`
    SELECT pr.username, COUNT(*) AS num_planets,
      STRING_AGG(p.galaxy || ':' || p.solar_system || ':' || p.position, ', ' ORDER BY p.galaxy, p.solar_system, p.position) AS coords
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id AND p.planet_type='planet' AND NOT p.is_destroyed
    WHERE pr.is_bot = true
    GROUP BY pr.username
    ORDER BY num_planets DESC, pr.username
  `);
  console.table(planets.rows);

  // 7. Colas activas
  console.log('\n⏳ 7. COLAS ACTIVAS DE BOTS:');
  const buildQ = await client.query(`
    SELECT pr.username, 'building' AS type, bt.code AS item, bq.target_level, bq.end_time,
      CASE WHEN bq.end_time <= now() THEN '⚠️ EXPIRADA' ELSE '✅ en curso' END AS status
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN profiles pr ON pr.id = p.user_id AND pr.is_bot = true
    JOIN building_types bt ON bt.id = bq.building_type_id
    ORDER BY bq.end_time
    LIMIT 30
  `);
  const shipQ = await client.query(`
    SELECT pr.username, sq.item_type AS type,
      COALESCE(st.code, dt.code) AS item, sq.quantity, sq.quantity_completed,
      sq.current_unit_end_time AS end_time,
      CASE WHEN sq.current_unit_end_time <= now() THEN '⚠️ EXPIRADA' ELSE '✅ en curso' END AS status
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    JOIN profiles pr ON pr.id = p.user_id AND pr.is_bot = true
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    LEFT JOIN defense_types dt ON dt.id = sq.defense_type_id
    ORDER BY sq.current_unit_end_time
    LIMIT 30
  `);
  const resQ = await client.query(`
    SELECT pr.username, tt.code AS tech, ut.level, ut.research_end_time,
      CASE WHEN ut.research_end_time <= now() THEN '⚠️ EXPIRADA' ELSE '✅ en curso' END AS status
    FROM user_technologies ut
    JOIN profiles pr ON pr.id = ut.user_id AND pr.is_bot = true
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.is_researching = true
    ORDER BY ut.research_end_time
  `);
  if (buildQ.rows.length > 0) { console.log('  Building queues:'); console.table(buildQ.rows); }
  else console.log('  Building queues: VACÍAS');
  if (shipQ.rows.length > 0) { console.log('  Shipyard queues:'); console.table(shipQ.rows); }
  else console.log('  Shipyard queues: VACÍAS');
  if (resQ.rows.length > 0) { console.log('  Research queues:'); console.table(resQ.rows); }
  else console.log('  Research queues: VACÍAS');

  // 8. Flotas activas de bots
  console.log('\n✈️ 8. FLOTAS ACTIVAS DE BOTS:');
  const fleets = await client.query(`
    SELECT pr.username, f.mission_type, 
      f.target_galaxy||':'||f.target_system||':'||f.target_position AS target,
      f.is_returning, f.arrival_time, f.return_time
    FROM fleets f
    JOIN profiles pr ON pr.id = f.user_id AND pr.is_bot = true
    WHERE f.is_completed = false
    ORDER BY f.arrival_time
    LIMIT 30
  `);
  if (fleets.rows.length > 0) console.table(fleets.rows);
  else console.log('  Ninguna flota activa');

  // 9. Recursos en planetas bot
  console.log('\n💰 9. RECURSOS EN PLANETAS BOT:');
  const resources = await client.query(`
    SELECT pr.username, p.galaxy||':'||p.solar_system||':'||p.position AS coords,
      ROUND(r.metal) AS metal, ROUND(r.crystal) AS crystal, ROUND(r.deuterium) AS deut
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id AND p.planet_type='planet' AND NOT p.is_destroyed
    JOIN planet_resources r ON r.planet_id = p.id
    WHERE pr.is_bot = true
    ORDER BY pr.username, p.galaxy, p.solar_system, p.position
  `);
  console.table(resources.rows);

  // 10. Mensajes de espionaje recibidos por bots
  console.log('\n🕵️ 10. REPORTES DE ESPIONAJE DE BOTS (últimas 48h):');
  const spyReports = await client.query(`
    SELECT pr.username, COUNT(*) AS num_reports,
      MAX(m.created_at) AS ultimo_reporte
    FROM messages m
    JOIN profiles pr ON pr.id = m.recipient_id AND pr.is_bot = true
    WHERE m.message_type = 'espionage' AND m.created_at >= NOW() - interval '48 hours'
    GROUP BY pr.username
    ORDER BY num_reports DESC
  `);
  if (spyReports.rows.length > 0) console.table(spyReports.rows);
  else console.log('  Ningún reporte de espionaje en 48h');

  // 11. Resumen general
  console.log('\n' + '='.repeat(80));
  console.log('  RESUMEN:');
  const summary = await client.query(`
    SELECT 
      COUNT(*) AS total_bots,
      SUM(CASE WHEN points_total > 0 THEN 1 ELSE 0 END) AS bots_con_puntos,
      ROUND(AVG(points_total)) AS avg_points,
      MAX(points_total) AS max_points,
      MIN(points_total) AS min_points
    FROM profiles WHERE is_bot = true
  `);
  console.table(summary.rows);

  const queueSummary = await client.query(`
    SELECT 
      (SELECT COUNT(*) FROM building_queue bq JOIN planets p ON p.id=bq.planet_id JOIN profiles pr ON pr.id=p.user_id WHERE pr.is_bot=true) AS building_queues,
      (SELECT COUNT(*) FROM building_queue bq JOIN planets p ON p.id=bq.planet_id JOIN profiles pr ON pr.id=p.user_id WHERE pr.is_bot=true AND bq.end_time <= now()) AS expired_building,
      (SELECT COUNT(*) FROM shipyard_queue sq JOIN planets p ON p.id=sq.planet_id JOIN profiles pr ON pr.id=p.user_id WHERE pr.is_bot=true) AS shipyard_queues,
      (SELECT COUNT(*) FROM shipyard_queue sq JOIN planets p ON p.id=sq.planet_id JOIN profiles pr ON pr.id=p.user_id WHERE pr.is_bot=true AND sq.current_unit_end_time <= now()) AS expired_shipyard,
      (SELECT COUNT(*) FROM user_technologies ut JOIN profiles pr ON pr.id=ut.user_id WHERE pr.is_bot=true AND ut.is_researching=true) AS researching,
      (SELECT COUNT(*) FROM user_technologies ut JOIN profiles pr ON pr.id=ut.user_id WHERE pr.is_bot=true AND ut.is_researching=true AND ut.research_end_time <= now()) AS expired_research,
      (SELECT COUNT(*) FROM fleets f JOIN profiles pr ON pr.id=f.user_id WHERE pr.is_bot=true AND f.is_completed=false) AS active_fleets
  `);
  const s = queueSummary.rows[0];
  console.log(`  Building queues: ${s.building_queues} (${s.expired_building} expiradas)`);
  console.log(`  Shipyard queues: ${s.shipyard_queues} (${s.expired_shipyard} expiradas)`);
  console.log(`  Researching: ${s.researching} (${s.expired_research} expiradas)`);
  console.log(`  Active fleets: ${s.active_fleets}`);

  if (parseInt(s.expired_building) > 0 || parseInt(s.expired_shipyard) > 0 || parseInt(s.expired_research) > 0) {
    console.log('\n  ⚠️  HAY COLAS EXPIRADAS → bot_process_queues() no las está completando correctamente');
  }

  const zeroPoints = parseInt(summary.rows[0].bots_con_puntos);
  const totalBots = parseInt(summary.rows[0].total_bots);
  if (zeroPoints === 0) {
    console.log('\n  🔴 NINGÚN BOT TIENE PUNTOS → Los bots NO están progresando');
  } else if (zeroPoints < totalBots) {
    console.log(`\n  🟡 ${totalBots - zeroPoints} bots con 0 puntos → Algunos bots no progresan`);
  } else {
    console.log('\n  🟢 Todos los bots tienen puntos → Progresión activa');
  }

  console.log('='.repeat(80));
  await client.end();
}

run().catch(e => { console.error(e); process.exit(1); });
