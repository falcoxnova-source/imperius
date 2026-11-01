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

  // 1. NPCs activos y sus puntos
  console.log('========== 1. NPCs ACTIVOS Y PUNTOS ==========');
  const npcs = await c.query(`
    SELECT p.id, p.username, p.points_total as points, p.is_bot, p.created_at
    FROM profiles p
    WHERE p.is_bot = true
    ORDER BY p.points_total DESC
  `);
  console.table(npcs.rows.map(r => ({ username: r.username, points: Number(r.points), created: r.created_at?.toISOString?.()?.slice(0,10) })));

  // 2. Recursos actuales en cada planeta NPC
  console.log('\n========== 2. RECURSOS EN PLANETAS NPC ==========');
  const resources = await c.query(`
    SELECT pr.username, pl.name as planet, pl.galaxy, pl.solar_system, pl.position,
           ROUND(r.metal) as metal, ROUND(r.crystal) as crystal, ROUND(r.deuterium) as deut,
           r.metal_per_hour, r.crystal_per_hour, r.deuterium_per_hour,
           r.last_update,
           ROUND(EXTRACT(EPOCH FROM (now() - r.last_update))/60) as mins_since_update
    FROM planet_resources r
    JOIN planets pl ON pl.id = r.planet_id
    JOIN profiles pr ON pr.id = pl.user_id
    WHERE pr.is_bot = true
    ORDER BY pr.username, pl.galaxy, pl.solar_system, pl.position
  `);
  for (const r of resources.rows) {
    console.log(`  ${r.username} | [${r.galaxy}:${r.solar_system}:${r.position}] ${r.planet}`);
    console.log(`    Metal: ${Number(r.metal).toLocaleString()} (${Number(r.metal_per_hour)}/h) | Crystal: ${Number(r.crystal).toLocaleString()} (${Number(r.crystal_per_hour)}/h) | Deut: ${Number(r.deut).toLocaleString()} (${Number(r.deuterium_per_hour)}/h)`);
    console.log(`    Última actualización: hace ${r.mins_since_update} minutos`);
  }

  // 3. Niveles de minas de cada NPC
  console.log('\n========== 3. NIVELES DE MINAS NPC ==========');
  const mines = await c.query(`
    SELECT pr.username, pl.galaxy, pl.solar_system, pl.position,
           MAX(CASE WHEN bt.code='metal_mine' THEN pb.level END) as metal_mine,
           MAX(CASE WHEN bt.code='crystal_mine' THEN pb.level END) as crystal_mine,
           MAX(CASE WHEN bt.code='deuterium_synthesizer' THEN pb.level END) as deut_synth,
           MAX(CASE WHEN bt.code='solar_plant' THEN pb.level END) as solar_plant,
           MAX(CASE WHEN bt.code='robotics_factory' THEN pb.level END) as robotics,
           MAX(CASE WHEN bt.code='shipyard' THEN pb.level END) as shipyard,
           MAX(CASE WHEN bt.code='research_lab' THEN pb.level END) as lab
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    JOIN planets pl ON pl.id = pb.planet_id
    JOIN profiles pr ON pr.id = pl.user_id
    WHERE pr.is_bot = true
    GROUP BY pr.username, pl.galaxy, pl.solar_system, pl.position
    ORDER BY pr.username
  `);
  console.table(mines.rows.map(r => ({
    npc: r.username, pos: `${r.galaxy}:${r.solar_system}:${r.position}`,
    metal_mine: r.metal_mine||0, crystal_mine: r.crystal_mine||0,
    deut_synth: r.deut_synth||0, solar: r.solar_plant||0,
    robotics: r.robotics||0, shipyard: r.shipyard||0, lab: r.lab||0
  })));

  // 4. Colas de construcción activas
  console.log('\n========== 4. COLAS DE CONSTRUCCIÓN ACTIVAS ==========');
  const queues = await c.query(`
    SELECT pr.username, bt.code as building, bq.target_level, bq.start_time, bq.end_time,
           ROUND(EXTRACT(EPOCH FROM (bq.end_time - now()))/60) as mins_left
    FROM building_queue bq
    JOIN planets pl ON pl.id = bq.planet_id
    JOIN profiles pr ON pr.id = pl.user_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE pr.is_bot = true
    ORDER BY bq.end_time
  `);
  if (queues.rows.length === 0) {
    console.log('  ⚠️ No hay construcciones en cola para NPCs');
  } else {
    console.table(queues.rows.map(r => ({ npc: r.username, building: r.building, lvl: r.target_level, mins_left: r.mins_left })));
  }

  // 5. Investigaciones activas
  console.log('\n========== 5. INVESTIGACIONES ACTIVAS ==========');
  const research = await c.query(`
    SELECT pr.username, tt.code as tech, rq.target_level, rq.end_time,
           ROUND(EXTRACT(EPOCH FROM (rq.end_time - now()))/60) as mins_left
    FROM research_queue rq
    JOIN profiles pr ON pr.id = rq.user_id
    JOIN technology_types tt ON tt.id = rq.technology_type_id
    WHERE pr.is_bot = true
    ORDER BY rq.end_time
  `);
  if (research.rows.length === 0) {
    console.log('  No hay investigaciones en cola');
  } else {
    console.table(research.rows.map(r => ({ npc: r.username, tech: r.research_code, lvl: r.target_level, mins_left: r.mins_left })));
  }

  // 6. Última ejecución del bot_ai_tick
  console.log('\n========== 6. CRON BOT_AI_TICK ==========');
  const cron = await c.query(`
    SELECT jobid, schedule, command, nodename 
    FROM cron.job 
    WHERE command ILIKE '%bot_ai_tick%'
  `);
  if (cron.rows.length === 0) {
    console.log('  ⚠️ No hay cron job para bot_ai_tick!');
  } else {
    console.table(cron.rows);
  }

  // 7. Probar ejecución directa del tick y ver resultado
  console.log('\n========== 7. EJECUTAR bot_ai_tick() AHORA ==========');
  try {
    const tick = await c.query(`SELECT bot_ai_tick() as result`);
    console.log('  Resultado:', JSON.stringify(tick.rows[0].result, null, 2));
  } catch (e) {
    console.log('  ❌ Error ejecutando bot_ai_tick():', e.message);
  }

  // 8. Verificar producción: recursos DESPUÉS del tick
  console.log('\n========== 8. RECURSOS DESPUÉS DEL TICK ==========');
  const after = await c.query(`
    SELECT pr.username, 
           ROUND(r.metal) as metal, ROUND(r.crystal) as crystal, ROUND(r.deuterium) as deut,
           r.metal_per_hour, r.crystal_per_hour, r.deuterium_per_hour
    FROM planet_resources r
    JOIN planets pl ON pl.id = r.planet_id
    JOIN profiles pr ON pr.id = pl.user_id
    WHERE pr.is_bot = true
    ORDER BY pr.username
  `);
  console.table(after.rows.map(r => ({
    npc: r.username, 
    metal: Number(r.metal).toLocaleString(), 
    crystal: Number(r.crystal).toLocaleString(),
    deut: Number(r.deut).toLocaleString(),
    'M/h': r.metal_per_hour, 'C/h': r.crystal_per_hour, 'D/h': r.deuterium_per_hour
  })));

  await c.end();
  console.log('\n✅ Diagnóstico completo');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
