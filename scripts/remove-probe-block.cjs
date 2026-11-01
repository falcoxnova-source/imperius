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

  // Get current source
  const { rows } = await c.query(`
    SELECT prosrc, pg_get_function_arguments(oid) as args FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);

  if (rows.length !== 1) {
    console.log('ERROR: Expected 1 version, found', rows.length);
    await c.end();
    return;
  }

  let src = rows[0].prosrc;
  const args = rows[0].args;

  // Remove the probe block
  const blockToRemove = `
  -- Block attack with only espionage probes
  IF p_mission_type = 'attack' THEN
    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.quantity > 0 AND x.ship_type_id != v_probe_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar solo con sondas de espionaje');
    END IF;
  END IF;

  `;

  const newSrc = src.replace(blockToRemove, '');

  if (newSrc === src) {
    console.log('Block not found - maybe already removed?');
    console.log('Has probe text:', src.includes('No puedes atacar solo con sondas'));
    await c.end();
    return;
  }

  const createStmt = `
CREATE OR REPLACE FUNCTION secure_send_fleet(${args})
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$${newSrc}$fn$;`;

  await c.query(createStmt);
  console.log('Done - probe attack block REMOVED');

  // Verify
  const { rows: check } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  console.log('Still has probe block:', check[0].prosrc.includes('No puedes atacar solo con sondas'));

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
