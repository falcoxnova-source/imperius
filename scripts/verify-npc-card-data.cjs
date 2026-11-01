const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  await client.connect();
  console.log('=== VERIFICACIÓN COMPLETA DE DATOS NPC EN CARTA DE USUARIO ===\n');

  // 1. Verificar MarinaAR72 específicamente (la de la captura)
  const marina = await client.query(`
    SELECT id, username, created_at,
           points_buildings, points_research, points_fleet, points_defense, points_total
    FROM profiles WHERE username = 'MarinaAR72'
  `);
  const m = marina.rows[0];
  console.log('--- MarinaAR72 (comparar con captura) ---');
  console.log(`Usuario: ${m.username}`);
  console.log(`Registro: ${m.created_at} (hace ${Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000)} días)`);
  console.log(`Alianza: -`);
  console.log(`Estructuras: ${(m.points_buildings/1000).toFixed(2)}K`);
  console.log(`Tecnología: ${(m.points_research/1000).toFixed(2)}K`);
  console.log(`Flotas: ${(m.points_fleet/1000).toFixed(2)}K`);
  console.log(`Defensas: ${(m.points_defense/1000).toFixed(2)}K`);
  console.log(`Total: ${(m.points_total/1000).toFixed(2)}K`);

  // 2. Verificar rankings
  const rankings = await client.query(`
    WITH ranked AS (
      SELECT id, username, points_total,
        RANK() OVER (ORDER BY points_total DESC) as rank_total,
        RANK() OVER (ORDER BY points_buildings DESC) as rank_buildings,
        RANK() OVER (ORDER BY points_research DESC) as rank_research,
        RANK() OVER (ORDER BY points_fleet DESC) as rank_fleet,
        RANK() OVER (ORDER BY points_defense DESC) as rank_defense
      FROM profiles WHERE is_admin = false
    )
    SELECT * FROM ranked WHERE username = 'MarinaAR72'
  `);
  const r = rankings.rows[0];
  console.log(`\nRangos: Total=${r.rank_total}, Estructuras=${r.rank_buildings}, Tecnología=${r.rank_research}, Flotas=${r.rank_fleet}, Defensas=${r.rank_defense}`);

  // 3. Verificar estadísticas de batallas
  console.log('\n--- Estadísticas de Batallas ---');
  const battleTables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND (table_name LIKE '%combat%' OR table_name LIKE '%battle%' OR table_name LIKE '%report%' OR table_name LIKE '%fight%')
    ORDER BY table_name
  `);
  console.log('Tablas de batallas:', battleTables.rows.map(r => r.table_name));

  // 4. Verificar destrucciones
  console.log('\n--- Destrucciones ---');
  const destroyTables = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name LIKE '%destroy%' OR table_name LIKE '%destruct%' OR table_name LIKE '%kill%'
    ORDER BY table_name
  `);
  console.log('Tablas de destrucción:', destroyTables.rows.map(r => r.table_name));

  // 5. Verificar TODOS los NPCs tienen datos coherentes
  console.log('\n\n=== VERIFICACIÓN GLOBAL DE TODOS LOS NPCs ===');
  const allNpcs = await client.query(`
    SELECT p.username, p.points_total, p.points_buildings, p.points_research, p.points_fleet, p.points_defense,
           p.created_at,
           (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = p.id) as num_planets,
           (SELECT COUNT(*) FROM planets pl WHERE pl.user_id = p.id AND pl.is_main_planet = true) as main_planets
    FROM profiles p
    WHERE p.is_bot = true
    ORDER BY p.points_total DESC
    LIMIT 15
  `);
  
  console.log('Top 15 NPCs:');
  console.log('Username'.padEnd(20), 'Total'.padStart(10), 'Build'.padStart(10), 'Research'.padStart(10), 
              'Fleet'.padStart(10), 'Defense'.padStart(10), 'Planets'.padStart(8), 'MainPl'.padStart(7));
  
  let issues = [];
  for (const n of allNpcs.rows) {
    const sum = Number(n.points_buildings) + Number(n.points_research) + Number(n.points_fleet) + Number(n.points_defense);
    const diff = Math.abs(sum - Number(n.points_total));
    const flag = diff > 10 ? ' ⚠️ SUM MISMATCH' : '';
    const mainFlag = Number(n.main_planets) !== 1 ? ' ⚠️ MAIN_PLANET!' : '';
    
    console.log(
      n.username.padEnd(20),
      Number(n.points_total).toLocaleString().padStart(10),
      Number(n.points_buildings).toLocaleString().padStart(10),
      Number(n.points_research).toLocaleString().padStart(10),
      Number(n.points_fleet).toLocaleString().padStart(10),
      Number(n.points_defense).toLocaleString().padStart(10),
      n.num_planets.toString().padStart(8),
      n.main_planets.toString().padStart(7),
      flag + mainFlag
    );
    
    if (diff > 10) issues.push(`${n.username}: sum=${sum} vs total=${n.points_total}`);
    if (Number(n.main_planets) !== 1) issues.push(`${n.username}: ${n.main_planets} main planets`);
  }

  // 6. Verificar que las coordenadas del planeta principal se pueden obtener
  console.log('\n\n=== VERIFICACIÓN DE COORDENADAS EN CARTA ===');
  const coordCheck = await client.query(`
    SELECT p.username, pl.name, pl.galaxy, pl.solar_system, pl.position
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.is_main_planet = true
    WHERE p.is_bot = true
    ORDER BY p.points_total DESC
    LIMIT 15
  `);
  
  for (const c of coordCheck.rows) {
    console.log(`${c.username.padEnd(20)} → [${c.galaxy}:${c.solar_system}:${c.position}] (${c.name})`);
  }

  // 7. Verificar query exacta que usa el frontend
  console.log('\n\n=== SIMULACIÓN DE QUERY DEL FRONTEND (handlePlayerClick) ===');
  const frontendQuery = await client.query(`
    SELECT galaxy, solar_system, position 
    FROM planets 
    WHERE user_id = $1 AND is_main_planet = true
    LIMIT 1
  `, [m.id]);
  
  if (frontendQuery.rows.length === 1) {
    const fp = frontendQuery.rows[0];
    console.log(`✅ MarinaAR72 planeta principal: [${fp.galaxy}:${fp.solar_system}:${fp.position}]`);
  } else {
    console.log(`❌ Query devuelve ${frontendQuery.rows.length} resultados`);
  }

  // 8. Resumen de problemas
  console.log('\n\n=== RESUMEN ===');
  if (issues.length === 0) {
    console.log('✅ Todos los NPCs verificados correctamente');
  } else {
    console.log(`⚠️ ${issues.length} problemas encontrados:`);
    issues.forEach(i => console.log(`  - ${i}`));
  }

  await client.end();
}

verify().catch(e => { console.error(e); process.exit(1); });
