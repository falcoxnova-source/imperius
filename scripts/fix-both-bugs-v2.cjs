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

  // =========================================================================
  // BUG #2 FIX: Remove duplicate expedition message from process_fleet_arrival
  // =========================================================================
  console.log('=== BUG #2: Fixing process_fleet_arrival expedition branch ===');

  const pfaDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_fleet_arrival'
  `);
  let pfaFull = pfaDef.rows[0].def;

  // Find and replace using indexOf for reliability
  const expMarker = "WHEN 'expedition' THEN";
  const expIdx = pfaFull.indexOf(expMarker);
  if (expIdx === -1) {
    console.log('❌ Cannot find expedition branch');
    await c.end();
    return;
  }

  // Find the next WHEN or END CASE after the expedition branch
  const nextWhen = pfaFull.indexOf("WHEN 'destroy'", expIdx);
  if (nextWhen === -1) {
    console.log('❌ Cannot find destroy branch after expedition');
    await c.end();
    return;
  }

  // Extract the current expedition section
  const oldSection = pfaFull.substring(expIdx, nextWhen);
  console.log('Old expedition section:');
  console.log(JSON.stringify(oldSection));

  // Replace with the clean version
  const newSection = "WHEN 'expedition' THEN\nv_expedition_result := process_expedition(p_fleet_id);\n-- process_expedition already handles messages and is_returning\n\n";
  
  pfaFull = pfaFull.substring(0, expIdx) + newSection + pfaFull.substring(nextWhen);
  
  // Deploy
  await c.query(pfaFull);
  console.log('✅ process_fleet_arrival patched - duplicate expedition message removed');

  // Verify
  const v1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const src1 = v1.rows[0].prosrc;
  const hasOldInsert = src1.includes("'Reporte de Expedicion'");
  const hasNewComment = src1.includes('process_expedition already handles');
  console.log('Verification - old INSERT removed:', !hasOldInsert);
  console.log('Verification - new comment present:', hasNewComment);

  // =========================================================================
  // BUG #1 FIX: Add allied stationed fleets to perform_acs_combat
  // =========================================================================
  console.log('\n=== BUG #1: Fixing perform_acs_combat ===');

  const acsDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'perform_acs_combat'
  `);
  let acsFull = acsDef.rows[0].def;

  // 1) Add v_allied_fleet variable
  const declEnd = acsFull.indexOf('BEGIN\n');
  if (declEnd === -1) {
    console.log('❌ Cannot find BEGIN');
    await c.end();
    return;
  }
  
  if (!acsFull.includes('v_allied_fleet')) {
    acsFull = acsFull.substring(0, declEnd) + 'v_allied_fleet record;\n' + acsFull.substring(declEnd);
    console.log('✅ Added v_allied_fleet variable');
  }

  // 2) Add source='planet' to defender ships jsonb_build_object
  // Find the defender ships section (after the attacker loop ends)
  const defShipsMarker = "FROM planet_ships ps";
  const defShipsIdx = acsFull.indexOf(defShipsMarker);
  
  // Find the 'is_defense', false in the defender ships section (not attacker)
  const isDefFalseIdx = acsFull.indexOf("'is_defense', false", defShipsIdx);
  if (isDefFalseIdx > -1) {
    // Check if source already added
    const nextChars = acsFull.substring(isDefFalseIdx, isDefFalseIdx + 50);
    if (!nextChars.includes("'source'")) {
      acsFull = acsFull.substring(0, isDefFalseIdx) + 
        "'is_defense', false,\n'source', 'planet'" + 
        acsFull.substring(isDefFalseIdx + "'is_defense', false".length);
      console.log('✅ Added source=planet to defender ships');
    }
  }

  // 3) Add source='defense' to defender defenses
  const isDefTrueIdx = acsFull.indexOf("'is_defense', true");
  if (isDefTrueIdx > -1) {
    const nextChars2 = acsFull.substring(isDefTrueIdx, isDefTrueIdx + 50);
    if (!nextChars2.includes("'source'")) {
      acsFull = acsFull.substring(0, isDefTrueIdx) + 
        "'is_defense', true,\n'source', 'defense'" + 
        acsFull.substring(isDefTrueIdx + "'is_defense', true".length);
      console.log('✅ Added source=defense to defenses');
    }
  }

  // 4) Add the allied fleet loop before simulate_xnova_combat
  const simIdx = acsFull.indexOf('v_combat_result := simulate_xnova_combat');
  if (simIdx === -1) {
    console.log('❌ Cannot find simulate_xnova_combat call');
    await c.end();
    return;
  }

  const alliedFleetLoop = `
-- === ALLIED STATIONED FLEETS (deployed on this planet via Alliance Depot) ===
FOR v_allied_fleet IN
  SELECT f.id as fleet_id, f.user_id as ally_user_id
  FROM fleets f
  WHERE f.target_galaxy = (SELECT galaxy FROM planets WHERE id = p_target_planet_id)
    AND f.target_system = (SELECT solar_system FROM planets WHERE id = p_target_planet_id)
    AND f.target_position = (SELECT position FROM planets WHERE id = p_target_planet_id)
    AND f.mission_type = 'deploy'
    AND f.is_completed = false
    AND f.is_returning = false
    AND f.user_id != v_defender_id
    AND NOT EXISTS (SELECT 1 FROM acs_participants ap WHERE ap.acs_id = p_acs_id AND ap.user_id = f.user_id)
    AND f.arrival_time <= now()
LOOP
  SELECT 
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'weapons_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'shielding_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'armour_tech'), 0)
  INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

  FOR v_ship_record IN
    SELECT fs.ship_type_id, fs.quantity, st.code, st.name, st.weapon_power, st.shield_power,
           st.structural_integrity, st.metal_cost, st.crystal_cost, st.rapid_fire
    FROM fleet_ships fs
    JOIN ship_types st ON fs.ship_type_id = st.id
    WHERE fs.fleet_id = v_allied_fleet.fleet_id AND fs.quantity > 0
  LOOP
    v_weapon := FLOOR(v_ship_record.weapon_power * (1 + v_weapon_bonus * 0.10));
    v_shield := FLOOR(v_ship_record.shield_power * (1 + v_shield_bonus * 0.10));
    v_hull := FLOOR(v_ship_record.structural_integrity * (1 + v_hull_bonus * 0.10));

    v_defender_units := v_defender_units || jsonb_build_object(
      'type_id', v_ship_record.ship_type_id,
      'code', v_ship_record.code,
      'name', v_ship_record.name,
      'quantity', v_ship_record.quantity,
      'initial_quantity', v_ship_record.quantity,
      'weapon', v_weapon,
      'shield', v_shield,
      'hull', v_hull,
      'current_hull', v_hull * v_ship_record.quantity,
      'current_shield', v_shield * v_ship_record.quantity,
      'metal_cost', v_ship_record.metal_cost,
      'crystal_cost', v_ship_record.crystal_cost,
      'rapid_fire', COALESCE(v_ship_record.rapid_fire, '{}'::jsonb),
      'is_defense', false,
      'source', v_allied_fleet.fleet_id::text
    );
  END LOOP;
END LOOP;

`;

  acsFull = acsFull.substring(0, simIdx) + alliedFleetLoop + acsFull.substring(simIdx);
  console.log('✅ Added allied fleet loop');

  // Deploy
  await c.query(acsFull);
  console.log('✅ perform_acs_combat re-deployed successfully');

  // Verify
  const v2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  const src2 = v2.rows[0].prosrc;
  console.log('Verification - has allied fleet section:', src2.includes('ALLIED STATIONED FLEETS'));
  console.log('Verification - has source=planet:', src2.includes("'source', 'planet'"));
  console.log('Verification - has source=defense:', src2.includes("'source', 'defense'"));
  console.log('Verification - excludes ACS participants:', src2.includes('acs_participants'));

  // =========================================================================
  // BUG #1 PART 2: Fix process_acs_fleet_arrival defender remaining loop
  // =========================================================================
  console.log('\n=== BUG #1 Part 2: Fixing process_acs_fleet_arrival defender remaining ===');

  const acsArrDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_acs_fleet_arrival'
  `);
  let acsArrFull = acsArrDef.rows[0].def;

  // Find the "Update defender remaining" section
  const defRemMarker = "defender_remaining";
  // There are multiple occurrences, find the one in the FOR loop
  const forDefRemIdx = acsArrFull.indexOf("FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')");
  
  if (forDefRemIdx === -1) {
    console.log('❌ Cannot find defender_remaining FOR loop');
    // Try finding it differently
    let idx = 0;
    while (true) {
      idx = acsArrFull.indexOf('defender_remaining', idx);
      if (idx === -1) break;
      console.log('Found at', idx, ':', acsArrFull.substring(idx - 30, idx + 80));
      idx += 20;
    }
    await c.end();
    return;
  }

  // Find the END LOOP that closes this section
  const afterForIdx = forDefRemIdx;
  // Find the matching END LOOP
  let endLoopSearch = afterForIdx;
  let loopDepth = 0;
  let endLoopIdx = -1;
  
  // Simple approach: find the next "END LOOP;" after the FOR
  const lines = acsArrFull.substring(afterForIdx).split('\n');
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('FOR ') || line.startsWith('LOOP')) loopDepth++;
    if (line === 'END LOOP;') {
      loopDepth--;
      if (loopDepth <= 0) {
        endLoopIdx = afterForIdx + charCount + lines[i].length + 1;
        break;
      }
    }
    charCount += lines[i].length + 1;
  }

  if (endLoopIdx === -1) {
    console.log('❌ Cannot find END LOOP for defender remaining');
    await c.end();
    return;
  }

  const oldDefRemSection = acsArrFull.substring(forDefRemIdx, endLoopIdx);
  console.log('Old defender remaining section length:', oldDefRemSection.length);

  const newDefRemSection = `FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
  LOOP
    IF COALESCE(v_unit->>'source', 'planet') = 'defense' OR COALESCE((v_unit->>'is_defense')::boolean, false) THEN
      UPDATE planet_defenses
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
    ELSIF COALESCE(v_unit->>'source', 'planet') = 'planet' THEN
      UPDATE planet_ships
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
    ELSE
      -- Allied fleet ship: update fleet_ships for the stationed fleet
      BEGIN
        UPDATE fleet_ships 
        SET quantity = (v_unit->>'quantity')::integer
        WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
        
        IF NOT EXISTS (
          SELECT 1 FROM fleet_ships 
          WHERE fleet_id = (v_unit->>'source')::uuid AND quantity > 0
        ) THEN
          UPDATE fleets SET is_completed = true WHERE id = (v_unit->>'source')::uuid;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        UPDATE planet_ships
        SET quantity = (v_unit->>'quantity')::integer
        WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
      END;
    END IF;
  END LOOP;
`;

  acsArrFull = acsArrFull.substring(0, forDefRemIdx) + newDefRemSection + acsArrFull.substring(endLoopIdx);

  // Deploy
  await c.query(acsArrFull);
  console.log('✅ process_acs_fleet_arrival re-deployed successfully');

  // Verify
  const v3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  const src3 = v3.rows[0].prosrc;
  console.log('Verification - has source-based routing:', src3.includes("v_unit->>'source'"));
  console.log('Verification - handles allied fleets:', src3.includes('Allied fleet ship'));

  console.log('\n========================================');
  console.log('✅✅✅ ALL FIXES APPLIED SUCCESSFULLY ✅✅✅');
  console.log('========================================');
  console.log('Bug #1: perform_acs_combat now includes allied stationed fleets with source tagging');
  console.log('Bug #1: process_acs_fleet_arrival now routes allied fleet losses correctly');
  console.log('Bug #2: process_fleet_arrival no longer creates duplicate expedition messages');

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
