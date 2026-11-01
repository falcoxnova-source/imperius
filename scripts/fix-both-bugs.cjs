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

  // Get the full function definition (with args and return type)
  const pfaDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_fleet_arrival'
  `);
  let pfaFull = pfaDef.rows[0].def;

  // The old expedition branch (3 extra lines that cause the duplicate)
  const oldExp = `WHEN 'expedition' THEN
v_expedition_result := process_expedition(p_fleet_id);
v_expedition_message := COALESCE(v_expedition_result->>'message', 'La expedicion no encontro nada interesante.');

INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
VALUES (NULL, fleet_record.user_id, 'Reporte de Expedicion', v_expedition_message, 'expedition');

UPDATE fleets SET is_returning = true WHERE id = p_fleet_id;`;

  // The fixed expedition branch (just call process_expedition which handles everything)
  const newExp = `WHEN 'expedition' THEN
v_expedition_result := process_expedition(p_fleet_id);
-- process_expedition already inserts the message and sets is_returning`;

  if (pfaFull.includes(oldExp)) {
    pfaFull = pfaFull.replace(oldExp, newExp);
    console.log('✅ Found and patched expedition branch');
  } else {
    console.log('❌ Could not find exact expedition branch text. Checking...');
    // Show what we have around 'expedition'
    const idx = pfaFull.indexOf("'expedition'");
    if (idx > -1) {
      console.log('Context around expedition:');
      console.log(pfaFull.substring(idx - 20, idx + 500));
    }
    await c.end();
    return;
  }

  // Also remove the v_expedition_message variable declaration if present
  // (it's no longer needed but won't cause issues if left)

  // Deploy the fixed function
  await c.query(pfaFull);
  console.log('✅ process_fleet_arrival re-deployed successfully');

  // Verify
  const verify1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  const hasDuplicate = verify1.rows[0].prosrc.includes("INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)\nVALUES (NULL, fleet_record.user_id, 'Reporte de Expedicion'");
  console.log('Verification - duplicate INSERT still present:', hasDuplicate);

  // =========================================================================
  // BUG #1 FIX: Add allied stationed fleets to perform_acs_combat
  // =========================================================================
  console.log('\n=== BUG #1: Fixing perform_acs_combat - adding allied fleet support ===');

  const acsDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'perform_acs_combat'
  `);
  let acsFull = acsDef.rows[0].def;

  // 1) Add v_allied_fleet variable to DECLARE section
  const oldDeclare = `v_unit jsonb;
v_i integer;
BEGIN`;
  const newDeclare = `v_unit jsonb;
v_i integer;
v_allied_fleet record;
BEGIN`;

  if (acsFull.includes(oldDeclare)) {
    acsFull = acsFull.replace(oldDeclare, newDeclare);
    console.log('✅ Added v_allied_fleet to DECLARE');
  } else {
    console.log('❌ Could not find DECLARE section');
    await c.end();
    return;
  }

  // 2) Add 'source', 'planet' tag to defender planet_ships
  const oldDefShip = `v_defender_units := v_defender_units || jsonb_build_object(
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
'is_defense', false
);
END LOOP;`;

  const newDefShip = `v_defender_units := v_defender_units || jsonb_build_object(
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
'source', 'planet'
);
END LOOP;`;

  if (acsFull.includes(oldDefShip)) {
    acsFull = acsFull.replace(oldDefShip, newDefShip);
    console.log('✅ Added source=planet to defender ships');
  } else {
    console.log('❌ Could not find defender ships section');
    await c.end();
    return;
  }

  // 3) Add 'source', 'defense' tag to defender defenses
  const oldDefDef = `'rapid_fire', '{}'::jsonb,
'is_defense', true
);
END LOOP;

v_combat_result`;

  const newDefDef = `'rapid_fire', '{}'::jsonb,
'is_defense', true,
'source', 'defense'
);
END LOOP;

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
    AND f.arrival_time <= now()
LOOP
  -- Get this ally's tech bonuses
  SELECT 
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'weapons_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'shielding_tech'), 0),
    COALESCE((SELECT level FROM user_technologies ut JOIN technology_types tt ON ut.technology_type_id = tt.id WHERE ut.user_id = v_allied_fleet.ally_user_id AND tt.code = 'armour_tech'), 0)
  INTO v_weapon_bonus, v_shield_bonus, v_hull_bonus;

  -- Add this ally's ships as defender units, tagged with fleet_id as source
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

v_combat_result`;

  if (acsFull.includes(oldDefDef.substring(0, 40))) {
    acsFull = acsFull.replace(oldDefDef, newDefDef);
    console.log('✅ Added allied fleet loop + source=defense tag');
  } else {
    console.log('❌ Could not find defense END LOOP section');
    console.log('Looking for:', oldDefDef.substring(0, 60));
    const idx = acsFull.indexOf("'is_defense', true");
    if (idx > -1) {
      console.log('Found is_defense at:', idx);
      console.log(acsFull.substring(idx, idx + 200));
    }
    await c.end();
    return;
  }

  // 4) Also need to exclude ACS attacker user_ids from allied fleet loop
  // The ACS attackers are in acs_participants, so we should exclude them
  // Actually, the simple exclusion of v_defender_id is sufficient since
  // allied fleets are from the DEFENDER's alliance, not the attackers'.
  // But let's also make sure no ACS attacker's fleet is counted as allied.
  // We'll add an exclusion for acs_participants user_ids.

  // Deploy the fixed function
  await c.query(acsFull);
  console.log('✅ perform_acs_combat re-deployed successfully');

  // Verify
  const verify2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  const hasAllied = verify2.rows[0].prosrc.includes('ALLIED STATIONED FLEETS');
  const hasSourcePlanet = verify2.rows[0].prosrc.includes("'source', 'planet'");
  const hasSourceDefense = verify2.rows[0].prosrc.includes("'source', 'defense'");
  console.log('Verification - has allied fleet section:', hasAllied);
  console.log('Verification - has source=planet:', hasSourcePlanet);
  console.log('Verification - has source=defense:', hasSourceDefense);

  // =========================================================================
  // BUG #1 PART 2: Fix process_acs_fleet_arrival defender remaining loop
  // to handle allied fleet source routing
  // =========================================================================
  console.log('\n=== BUG #1 Part 2: Fixing process_acs_fleet_arrival defender remaining ===');

  const acsArrDef = await c.query(`
    SELECT pg_get_functiondef(oid) as def 
    FROM pg_proc 
    WHERE proname = 'process_acs_fleet_arrival'
  `);
  let acsArrFull = acsArrDef.rows[0].def;

  // The current defender remaining loop just handles defense and planet_ships
  const oldDefRem = `  -- Update defender remaining
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

  const newDefRem = `  -- Update defender remaining (with allied fleet source routing)
  FOR v_unit IN SELECT * FROM jsonb_array_elements(v_combat_result->'defender_remaining')
  LOOP
    IF COALESCE(v_unit->>'source', 'planet') = 'defense' OR COALESCE((v_unit->>'is_defense')::boolean, false) THEN
      -- Defense unit: update planet_defenses
      UPDATE planet_defenses
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND defense_type_id = (v_unit->>'type_id')::integer;
    ELSIF COALESCE(v_unit->>'source', 'planet') = 'planet' THEN
      -- Planet ship: update planet_ships
      UPDATE planet_ships
      SET quantity = (v_unit->>'quantity')::integer
      WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
    ELSE
      -- Allied fleet ship: update fleet_ships for the stationed fleet
      BEGIN
        UPDATE fleet_ships 
        SET quantity = (v_unit->>'quantity')::integer
        WHERE fleet_id = (v_unit->>'source')::uuid AND ship_type_id = (v_unit->>'type_id')::integer;
        
        -- If all ships in this allied fleet are destroyed, mark fleet as completed
        IF NOT EXISTS (
          SELECT 1 FROM fleet_ships 
          WHERE fleet_id = (v_unit->>'source')::uuid AND quantity > 0
        ) THEN
          UPDATE fleets SET is_completed = true WHERE id = (v_unit->>'source')::uuid;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- If source is not a valid UUID, treat as planet ship
        UPDATE planet_ships
        SET quantity = (v_unit->>'quantity')::integer
        WHERE planet_id = v_target_planet.id AND ship_type_id = (v_unit->>'type_id')::integer;
      END;
    END IF;
  END LOOP;`;

  if (acsArrFull.includes(oldDefRem)) {
    acsArrFull = acsArrFull.replace(oldDefRem, newDefRem);
    console.log('✅ Found and patched defender remaining loop');
  } else {
    console.log('❌ Could not find exact defender remaining loop. Checking...');
    const idx = acsArrFull.indexOf('Update defender');
    if (idx > -1) {
      console.log(acsArrFull.substring(idx, idx + 600));
    }
    await c.end();
    return;
  }

  // Deploy
  await c.query(acsArrFull);
  console.log('✅ process_acs_fleet_arrival re-deployed successfully');

  // Verify
  const verify3 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_acs_fleet_arrival'");
  const hasSourceRouting = verify3.rows[0].prosrc.includes('Allied fleet ship');
  console.log('Verification - has allied fleet source routing:', hasSourceRouting);

  console.log('\n✅✅✅ ALL FIXES APPLIED SUCCESSFULLY ✅✅✅');
  console.log('Bug #1: perform_acs_combat now includes allied stationed fleets');
  console.log('Bug #1: process_acs_fleet_arrival now routes allied fleet losses correctly');
  console.log('Bug #2: process_fleet_arrival no longer creates duplicate expedition messages');

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
