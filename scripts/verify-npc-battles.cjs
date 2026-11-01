const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});

async function run() {
  await c.connect();
  
  // Check battle/destruction stats for NPCs
  const stats = await c.query(`
    SELECT username, battles_won, battles_draw, battles_lost, units_destroyed, units_lost
    FROM profiles WHERE is_bot = true
    ORDER BY points_total DESC LIMIT 15
  `);
  
  console.log('=== ESTADÍSTICAS DE BATALLAS Y DESTRUCCIONES DE NPCs ===\n');
  console.log('Username'.padEnd(18), 'Won'.padStart(5), 'Draw'.padStart(5), 'Lost'.padStart(5), 
              'Destroyed'.padStart(12), 'UnitsLost'.padStart(12));
  
  for (const s of stats.rows) {
    console.log(
      s.username.padEnd(18),
      String(s.battles_won||0).padStart(5),
      String(s.battles_draw||0).padStart(5),
      String(s.battles_lost||0).padStart(5),
      String(s.units_destroyed||0).padStart(12),
      String(s.units_lost||0).padStart(12)
    );
  }

  // Check if any NPC has battle reports
  const reports = await c.query(`
    SELECT COUNT(*) as cnt FROM battle_reports br
    JOIN profiles p ON (p.id = br.attacker_id OR p.id = br.defender_id)
    WHERE p.is_bot = true
  `);
  console.log(`\nReportes de batalla con NPCs: ${reports.rows[0].cnt}`);

  // Verify points_total = sum of parts for ALL bots
  const mismatch = await c.query(`
    SELECT username, points_total, 
           (points_buildings + points_research + points_fleet + points_defense) as sum_parts,
           points_total - (points_buildings + points_research + points_fleet + points_defense) as diff
    FROM profiles WHERE is_bot = true 
    AND ABS(points_total - (points_buildings + points_research + points_fleet + points_defense)) > 10
  `);
  
  if (mismatch.rows.length === 0) {
    console.log('\n✅ Todos los NPCs: points_total = sum(buildings+research+fleet+defense)');
  } else {
    console.log(`\n⚠️ ${mismatch.rows.length} NPCs con puntos inconsistentes:`);
    mismatch.rows.forEach(r => console.log(`  ${r.username}: total=${r.points_total}, sum=${r.sum_parts}, diff=${r.diff}`));
  }

  // Verify all 50 bots have at least 1 planet
  const noPlanet = await c.query(`
    SELECT p.username FROM profiles p
    WHERE p.is_bot = true
    AND NOT EXISTS (SELECT 1 FROM planets pl WHERE pl.user_id = p.id)
  `);
  if (noPlanet.rows.length === 0) {
    console.log('✅ Todos los NPCs tienen al menos 1 planeta');
  } else {
    console.log(`⚠️ ${noPlanet.rows.length} NPCs sin planetas!`);
  }

  // Verify exactly 1 main planet per bot
  const badMain = await c.query(`
    SELECT p.username, COUNT(*) as main_count
    FROM profiles p
    JOIN planets pl ON pl.user_id = p.id AND pl.is_main_planet = true
    WHERE p.is_bot = true
    GROUP BY p.username
    HAVING COUNT(*) != 1
  `);
  if (badMain.rows.length === 0) {
    console.log('✅ Todos los NPCs tienen exactamente 1 planeta principal');
  } else {
    console.log(`⚠️ ${badMain.rows.length} NPCs con problemas de planeta principal`);
  }

  // Total bot count
  const total = await c.query(`SELECT COUNT(*) FROM profiles WHERE is_bot = true`);
  console.log(`\nTotal NPCs: ${total.rows[0].count}`);

  await c.end();
}
run().catch(e => { console.error(e); process.exit(1); });
