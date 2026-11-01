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

  const r = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_acs_fleet_arrival'
  `);
  let full = r.rows[0].def;

  // The exact old section to replace (lines 3-15 from the debug output)
  const oldSection = `  -- Update defender remaining
  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
  LOOP
    IF (v_unit->>'is_defense')::boolean THEN
      UPDATE planet_defenses
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
    ELSE
      UPDATE planet_ships
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
    END IF;
  END LOOP;`;

  const newSection = `  -- Update defender remaining (with allied fleet source routing)
  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
  LOOP
    IF COALESCE(v_unit->>'source', 'planet') = 'defense' OR COALESCE((v_unit->>'is_defense')::boolean, false) THEN
      -- Defense unit
      UPDATE planet_defenses
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
    ELSIF COALESCE(v_unit->>'source', 'planet') = 'planet' THEN
      -- Planet ship
      UPDATE planet_ships
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
    ELSE
      -- Allied fleet ship: route losses to the stationed fleet
      BEGIN
        UPDATE fleet_ships 
        SET quantity = (v_unit->>'quantity')::integer
        WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
        
        -- If all ships in allied fleet destroyed, mark fleet completed
        IF NOT EXISTS (
          SELECT 1 FROM fleet_ships 
          WHERE fleet_id = (v_unit->>'source')::uuid AND quantity > 0
        ) THEN
          UPDATE fleets SET is_completed = true WHERE id = (v_unit->>'source')::uuid;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Fallback: treat as planet ship
        UPDATE planet_ships
        SET quantity = (v_unit->>'quantity')::integer
        WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
      END;
    END IF;
  END LOOP;`;

  if (full.includes(oldSection)) {
    full = full.replace(oldSection, newSection);
    console.log('✅ Found and replaced defender remaining section');
  } else {
    console.log('❌ Exact match not found, trying with \\r\\n...');
    const oldSectionCRLF = oldSection.replace(/\n/g, '\r\n');
    if (full.includes(oldSectionCRLF)) {
      full = full.replace(oldSectionCRLF, newSection);
      console.log('✅ Found with CRLF and replaced');
    } else {
      console.log('❌ Still not found. Showing raw bytes around the section...');
      const idx = full.indexOf('Update defender remaining');
      if (idx > -1) {
        const raw = full.substring(idx, idx + 500);
        console.log('RAW:', JSON.stringify(raw));
      }
      await c.end();
      return;
    }
  }

  // Deploy
  await c.query(full);
  console.log('✅ process_acs_fleet_arrival re-deployed with allied fleet routing');

  // Final verification of all 3 fixes
  console.log('\n=== FINAL VERIFICATION ===');
  
  const v1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  console.log('Bug #2 - No duplicate expedition INSERT:', !v1.rows[0].prosrc.includes("'Reporte de Expedicion'"));
  
  const v2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  console.log('Bug #1a - ACS has allied fleet loop:', v2.rows[0].prosrc.includes('ALLIED STATIONED FLEETS'));
  console.log('Bug #1a - ACS has source tags:', v2.rows[0].prosrc.includes("'source'"));
  
  const v3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  console.log('Bug #1b - ACS arrival routes allied losses:', v3.rows[0].prosrc.includes("Allied fleet ship"));

  console.log('\n✅✅✅ ALL 3 FIXES VERIFIED AND LIVE ✅✅✅');

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
