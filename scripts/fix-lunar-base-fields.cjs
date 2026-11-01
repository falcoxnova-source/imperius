const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // =========================================================================
  // STEP 1: Fix the optimized_global_queue_processor function
  // =========================================================================
  console.log('STEP 1: Fixing optimized_global_queue_processor...');

  // Get current function source
  const fnInfo = await c.query(`
    SELECT p.prosrc, p.proargtypes, pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result_type, p.provolatile, p.prosecdef
    FROM pg_proc p WHERE p.proname = 'optimized_global_queue_processor' LIMIT 1
  `);

  if (!fnInfo.rows.length) {
    console.error('ERROR: Function not found!');
    await c.end();
    return;
  }

  let src = fnInfo.rows[0].prosrc;
  const resultType = fnInfo.rows[0].result_type;
  const isSecDef = fnInfo.rows[0].prosecdef;
  
  // Find the buggy line
  const buggyLine = 'SET fields_max = 1 + (v_queue_item.target_level * 3)';
  if (!src.includes(buggyLine)) {
    console.log('WARNING: Buggy line not found - maybe already fixed?');
    console.log('Searching for fields_max near lunar_base...');
    const idx = src.indexOf('v_is_lunar_base AND v_is_moon');
    if (idx > -1) {
      console.log(src.substring(idx, idx + 300));
    }
  } else {
    console.log('Found buggy line: ' + buggyLine);
    
    // Replace with correct formula using planet diameter
    const fixedLine = 'SET fields_max = FLOOR(pl.diameter / 1000.0) + (v_queue_item.target_level * 3)';
    
    // But we need to get diameter from the planets table. Let's check the context around the bug.
    // The current code does: UPDATE planets SET fields_max = 1 + (...) WHERE id = v_queue_item.planet_id;
    // We need to reference the planet's diameter in the UPDATE itself
    
    // The fix: use a self-referencing update with the diameter column
    const oldBlock = `IF v_is_lunar_base AND v_is_moon THEN
UPDATE planets
SET fields_max = 1 + (v_queue_item.target_level * 3)
WHERE id = v_queue_item.planet_id;
END IF;`;
    
    const newBlock = `IF v_is_lunar_base AND v_is_moon THEN
UPDATE planets
SET fields_max = FLOOR(diameter / 1000.0) + (v_queue_item.target_level * 3)
WHERE id = v_queue_item.planet_id;
END IF;`;
    
    if (src.includes(oldBlock)) {
      src = src.replace(oldBlock, newBlock);
      console.log('Replaced block successfully');
    } else {
      // Try more flexible match
      src = src.replace(
        /SET fields_max = 1 \+ \(v_queue_item\.target_level \* 3\)/,
        'SET fields_max = FLOOR(diameter / 1000.0) + (v_queue_item.target_level * 3)'
      );
      console.log('Replaced via regex');
    }
    
    // Recreate the function
    const security = isSecDef ? 'SECURITY DEFINER' : '';
    const createSQL = `
CREATE OR REPLACE FUNCTION optimized_global_queue_processor()
RETURNS ${resultType}
LANGUAGE plpgsql
${security}
AS $function$
${src}
$function$;
    `;
    
    await c.query(createSQL);
    console.log('✅ Function updated successfully!');
    
    // Verify the fix
    const verify = await c.query("SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor' LIMIT 1");
    const verifiedSrc = verify.rows[0].prosrc;
    if (verifiedSrc.includes('FLOOR(diameter / 1000.0)')) {
      console.log('✅ Verified: Function now uses FLOOR(diameter / 1000.0)');
    } else if (verifiedSrc.includes('1 + (v_queue_item.target_level * 3)')) {
      console.error('❌ Fix NOT applied - old formula still present!');
    } else {
      console.log('⚠️ Cannot confirm - check manually');
    }
  }

  // =========================================================================
  // STEP 2: Fix all existing moons' fields_max
  // =========================================================================
  console.log('\nSTEP 2: Correcting all existing moons fields_max...');
  
  // First, let's see what needs fixing
  const moonsBefore = await c.query(`
    SELECT p.id, p.name, p.diameter, p.fields_max, p.fields_used,
           COALESCE(pb.level, 0) as lunar_level,
           pr.username,
           FLOOR(p.diameter / 1000.0) + COALESCE(pb.level, 0) * 3 as correct_fields_max
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
    LEFT JOIN profiles pr ON pr.id = p.user_id
    WHERE p.planet_type = 'moon'
    ORDER BY pr.username, p.name
  `);
  
  console.log(`\nFound ${moonsBefore.rows.length} total moons`);
  let needsFix = 0;
  for (const m of moonsBefore.rows) {
    const correct = parseInt(m.correct_fields_max);
    if (m.fields_max !== correct) {
      needsFix++;
      console.log(`  ❌ "${m.name}" (${m.username}): lunar lv${m.lunar_level}, diam=${m.diameter}, current=${m.fields_max}, correct=${correct}`);
    }
  }
  console.log(`\n${needsFix} moons need correction out of ${moonsBefore.rows.length} total`);
  
  if (needsFix > 0) {
    // Apply the fix to ALL moons
    const fixResult = await c.query(`
      UPDATE planets p
      SET fields_max = FLOOR(p.diameter / 1000.0) + COALESCE(
        (SELECT pb.level FROM planet_buildings pb 
         WHERE pb.planet_id = p.id 
         AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')),
        0
      ) * 3
      WHERE p.planet_type = 'moon'
      AND p.fields_max != FLOOR(p.diameter / 1000.0) + COALESCE(
        (SELECT pb.level FROM planet_buildings pb 
         WHERE pb.planet_id = p.id 
         AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')),
        0
      ) * 3
      RETURNING p.id, p.name, p.fields_max as new_fields_max
    `);
    
    console.log(`✅ Updated ${fixResult.rows.length} moons`);
    for (const r of fixResult.rows) {
      console.log(`  Fixed "${r.name}" → fields_max=${r.new_fields_max}`);
    }
  }

  // =========================================================================
  // STEP 3: Verify Roxy's moons specifically
  // =========================================================================
  console.log('\nSTEP 3: Verifying Roxy\'s moons...');
  const roxy = await c.query(`
    SELECT p.name, p.diameter, p.fields_max, p.fields_used,
           COALESCE(pb.level, 0) as lunar_level,
           FLOOR(p.diameter / 1000.0) as base_fields,
           FLOOR(p.diameter / 1000.0) + COALESCE(pb.level, 0) * 3 as expected
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id = p.id
      AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
    WHERE p.user_id = 'c6531fc3-0fa5-4293-92fe-8f3604d22bc9'
      AND p.planet_type = 'moon'
    ORDER BY p.name
  `);
  for (const m of roxy.rows) {
    const ok = m.fields_max === parseInt(m.expected) ? '✅' : '❌';
    console.log(`  ${ok} "${m.name}": diam=${m.diameter}, base=${m.base_fields}, lunar lv${m.lunar_level}, fields_max=${m.fields_max} (expected=${m.expected}), used=${m.fields_used}`);
  }

  await c.end();
  console.log('\nDone!');
}
main().catch(e => { console.error(e); process.exit(1); });
