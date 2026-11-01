const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Drop our duplicate (OID 359549 - the one with wrong param order)
  console.log('Dropping duplicate function...');
  await c.query(`
    DROP FUNCTION IF EXISTS secure_send_fleet(
      uuid, int, int, int, text, jsonb, int, bigint, bigint, bigint, text
    )
  `);

  // 2. Verify only 1 remains
  const { rows: check1 } = await c.query(`
    SELECT p.oid, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.proname = 'secure_send_fleet'
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  console.log('Remaining versions:', check1.length);
  for (const r of check1) {
    console.log('  OID', r.oid, ':', r.args);
  }

  if (check1.length !== 1) {
    console.log('ERROR: Expected exactly 1 version');
    await c.end();
    return;
  }

  // 3. Check if original already has our fix
  const { rows: srcRows } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE oid = ${check1[0].oid}
  `);
  const src = srcRows[0].prosrc;
  const hasFix = src.includes('No puedes atacar solo con sondas');
  console.log('\nOriginal has probe fix:', hasFix);

  if (!hasFix) {
    // 4. Inject the fix into the ORIGINAL function (with correct param order)
    console.log('Injecting probe fix into original...');
    
    const anchor = 'v_total_cargo_used := COALESCE(p_cargo_metal, 0)';
    const injection = `
  -- Block attack with only espionage probes
  IF p_mission_type = 'attack' THEN
    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.quantity > 0 AND x.ship_type_id != v_probe_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar solo con sondas de espionaje');
    END IF;
  END IF;

  `;

    const newSrc = src.replace(anchor, injection + anchor);
    if (newSrc === src) {
      console.log('ERROR: Could not find anchor point');
      await c.end();
      return;
    }

    // Get original param signature
    const args = check1[0].args;
    
    const createStmt = `
CREATE OR REPLACE FUNCTION secure_send_fleet(${args})
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$${newSrc}$fn$;`;

    await c.query(createStmt);
    console.log('Fix injected successfully!');
  }

  // 5. Final verification
  const { rows: final } = await c.query(`
    SELECT p.oid, pg_get_function_arguments(p.oid) as args
    FROM pg_proc p
    WHERE p.proname = 'secure_send_fleet'
    AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  console.log('\n=== FINAL STATE ===');
  console.log('Versions:', final.length);

  const { rows: finalSrc } = await c.query(`
    SELECT prosrc FROM pg_proc WHERE oid = ${final[0].oid}
  `);
  console.log('Has probe fix:', finalSrc[0].prosrc.includes('No puedes atacar solo con sondas'));

  await c.end();
}

main().catch(e => { console.error(e); c.end(); });
