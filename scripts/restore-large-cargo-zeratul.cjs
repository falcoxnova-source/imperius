const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  const userId = '361fbc06-8d5b-41c5-8e76-e3afee01f342'; // Zeratul

  // 1. Check messages  
  console.log('=== RECENT MESSAGES FOR ZERATUL ===');
  const msgs = await c.query(`
    SELECT id, sender_id, subject, message_type, is_read, created_at,
           CASE WHEN LENGTH(body::text) > 300 THEN LEFT(body::text, 300) || '...' ELSE body::text END as body_preview
    FROM messages
    WHERE recipient_id = $1
    ORDER BY created_at DESC
    LIMIT 30
  `, [userId]);
  for (const m of msgs.rows) {
    console.log(`  [${m.created_at}] type:${m.message_type} subj:${m.subject}`);
    console.log(`    body: ${m.body_preview}`);
    console.log('');
  }

  // 2. Search for messages mentioning combat or fleet return with large_cargo
  console.log('\n=== MESSAGES MENTIONING LARGE_CARGO OR GRAN CARGUERO ===');
  const lcMsgs = await c.query(`
    SELECT id, subject, message_type, created_at,
           CASE WHEN LENGTH(body::text) > 300 THEN LEFT(body::text, 300) || '...' ELSE body::text END as body_preview
    FROM messages
    WHERE recipient_id = $1 
      AND (body::text ILIKE '%large_cargo%' OR body::text ILIKE '%gran carguero%' OR body::text ILIKE '%carguero%')
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('Count:', lcMsgs.rowCount);
  for (const m of lcMsgs.rows) {
    console.log(`  [${m.created_at}] ${m.subject}: ${m.body_preview}`);
  }

  // 3. Check battle reports columns
  console.log('\n=== BATTLE_REPORTS COLUMNS ===');
  const brCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'battle_reports' ORDER BY ordinal_position
  `);
  console.log(brCols.rows.map(r => r.column_name).join(', '));

  // 4. Check ALL battle reports where target planet belongs to Zeratul
  console.log('\n=== BATTLE REPORTS WHERE TARGET IS ZERATUL PLANET ===');
  const brDef = await c.query(`
    SELECT br.id, br.attacker_id, br.defender_id, br.winner, br.created_at,
           br.planet_id, br.attacker_losses, br.defender_losses
    FROM battle_reports br
    WHERE br.planet_id IN (SELECT id FROM planets WHERE user_id = $1)
    ORDER BY br.created_at DESC
    LIMIT 10
  `, [userId]);
  console.log('Count:', brDef.rowCount);
  for (const r of brDef.rows) {
    console.log(`  ${r.id.substring(0,8)} | atk:${r.attacker_id?.substring(0,8)} | def:${r.defender_id?.substring(0,8)} | winner:${r.winner} | ${r.created_at}`);
  }

  // 5. What about recycling fleets that returned with cargo? Maybe large_cargo was built as cargo ships for recycling
  // Actually, the key question: were 160 large_cargo ever sent in ANY fleet?
  console.log('\n=== CHECKING ALL 51 ATTACK + 39 EXPEDITION FLEET IDS ===');
  // Since fleet_ships are deleted on completion, we can't check them directly
  // But we can check if any fleet's cargo might indicate carrying stuff with large_cargo
  
  // Let's check expeditions - they can find ships
  console.log('\n=== EXPEDITION FLEETS ===');
  const expFleets = await c.query(`
    SELECT f.id, f.is_completed, f.is_returning,
           f.target_galaxy || ':' || f.target_system || ':' || f.target_position as target,
           f.cargo_metal, f.cargo_crystal, f.cargo_deuterium,
           f.created_at, f.arrival_time
    FROM fleets f
    WHERE f.user_id = $1 AND f.mission_type = 'expedition'
    ORDER BY f.created_at DESC
    LIMIT 20
  `, [userId]);
  for (const f of expFleets.rows) {
    console.log(`  ${f.id.substring(0,8)} | ${f.target} | completed:${f.is_completed} | cargo: M${f.cargo_metal} C${f.cargo_crystal} D${f.cargo_deuterium} | ${f.created_at}`);
  }

  // 6. Check the process_fleet_arrival function for any bugs with fleet_ships DELETE
  // Specifically: does process_fleet_arrival handle "return" missions by inserting ships back?
  console.log('\n=== process_fleet_arrival FUNCTION SOURCE (relevant part) ===');
  const pfa = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'
  `);
  if (pfa.rows.length > 0) {
    const src = pfa.rows[0].prosrc;
    // Find the section about returning fleets
    const returnIdx = src.indexOf('is_returning');
    if (returnIdx > -1) {
      console.log(src.substring(Math.max(0, returnIdx - 200), returnIdx + 800));
    }
    // Find the section about deploy
    const deployIdx = src.indexOf('deploy');
    if (deployIdx > -1) {
      console.log('\n--- DEPLOY SECTION ---');
      console.log(src.substring(Math.max(0, deployIdx - 200), deployIdx + 600));
    }
  }

  // 7. NOW RESTORE: Add 160 large_cargo to main planet
  console.log('\n=== RESTORING 160 LARGE_CARGO TO MAIN PLANET [1:332:13] ===');
  const restore = await c.query(`
    UPDATE planet_ships 
    SET quantity = 160
    WHERE planet_id = $1 AND ship_type_id = 2
    RETURNING planet_id, ship_type_id, quantity
  `, [mainPlanetId]);
  
  if (restore.rowCount > 0) {
    console.log('✅ Updated large_cargo to 160:', JSON.stringify(restore.rows[0]));
  } else {
    // Insert if row doesn't exist
    const ins = await c.query(`
      INSERT INTO planet_ships (planet_id, ship_type_id, quantity)
      VALUES ($1, 2, 160)
      ON CONFLICT (planet_id, ship_type_id) DO UPDATE SET quantity = 160
      RETURNING planet_id, ship_type_id, quantity
    `, [mainPlanetId]);
    console.log('✅ Inserted large_cargo = 160:', JSON.stringify(ins.rows[0]));
  }

  // 8. Verify
  console.log('\n=== VERIFICATION ===');
  const verify = await c.query(`
    SELECT ps.quantity, st.code, p.galaxy || ':' || p.solar_system || ':' || p.position as coords
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    WHERE ps.planet_id = $1 AND ps.ship_type_id = 2
  `, [mainPlanetId]);
  console.log('Verified:', JSON.stringify(verify.rows[0]));

  await c.end();
}

main().catch(e => { console.error('ERROR:', e.message); c.end(); });
