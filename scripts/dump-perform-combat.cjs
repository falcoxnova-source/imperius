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

  // Dump the FULL perform_combat function
  console.log('=== PERFORM_COMBAT COMPLETA (desplegada) ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'`);
  if (fn.rows.length > 0) {
    console.log(fn.rows[0].prosrc);
  }

  // Also check battle_reports for the specific battle  
  // The previous query returned 0 rows - maybe attacker/defender names don't match
  console.log('\n\n=== BUSCAR BATALLAS EN [3:113:2] HOY ===');
  const bat = await c.query(`
    SELECT br.id, br.attacker_id, br.defender_id, br.result, br.coordinates, br.rounds,
           br.created_at, br.report_data,
           br.attacker_losses_metal, br.defender_losses_metal,
           br.loot_metal, br.loot_crystal, br.loot_deuterium
    FROM battle_reports br
    WHERE br.coordinates LIKE '%3:113:2%'
      AND br.created_at >= '2026-04-03'
    ORDER BY br.created_at DESC
  `);
  for (const b of bat.rows) {
    const attName = (await c.query(`SELECT username FROM profiles WHERE id = $1`, [b.attacker_id])).rows[0]?.username;
    const defName = (await c.query(`SELECT username FROM profiles WHERE id = $1`, [b.defender_id])).rows[0]?.username;
    console.log(`\n  [${b.created_at}] ${attName} vs ${defName}: ${b.result} coords:${b.coordinates}`);
    console.log(`  Rounds: ${b.rounds}, Loot: M:${b.loot_metal} C:${b.loot_crystal} D:${b.loot_deuterium}`);
    
    if (b.report_data) {
      const rd = b.report_data;
      if (rd.initial_attacker) {
        console.log('  Atacantes:');
        for (const u of rd.initial_attacker) {
          console.log(`    ${u.initial_quantity || u.quantity}x ${u.name} (${u.code})`);
        }
      }
      if (rd.initial_defender) {
        console.log('  Defensores:');
        for (const u of rd.initial_defender) {
          console.log(`    ${u.initial_quantity || u.quantity}x ${u.name} (${u.code}) [source: ${u.source || '?'}]`);
        }
      }
    }
  }

  // Check ALL battles on Aleja's planets today
  console.log('\n=== TODAS LAS BATALLAS EN PLANETAS DE ALEJA HOY ===');
  const alejaId = (await c.query(`SELECT id FROM profiles WHERE username = 'Aleja'`)).rows[0]?.id;
  if (alejaId) {
    const allBats = await c.query(`
      SELECT br.id, br.attacker_id, br.defender_id, br.result, br.coordinates, br.rounds,
             br.created_at, br.planet_id
      FROM battle_reports br
      WHERE br.defender_id = $1
        AND br.created_at >= '2026-04-03'
      ORDER BY br.created_at DESC
    `, [alejaId]);
    for (const b of allBats.rows) {
      const attName = (await c.query(`SELECT username FROM profiles WHERE id = $1`, [b.attacker_id])).rows[0]?.username;
      console.log(`  [${b.created_at}] ${attName} → coords:${b.coordinates} = ${b.result} (planet:${b.planet_id?.substring(0,8)})`);
    }
  }

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
