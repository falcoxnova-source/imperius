// Fix the critical bug: jsonb_agg(x) was wrapping rows as {jsonb_build_object: {...}}
// instead of passing the object directly. Alias the column AS obj and jsonb_agg(obj).
const { Client } = require('pg');
const fs = require('fs');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  let src = r.rows[0].prosrc;

  // The buggy block in Phase H (the p_fleet_ships argument to secure_send_fleet for miner/transport)
  const buggy = `p_fleet_ships := (
                    SELECT jsonb_agg(x) FROM (
                      -- [FUEL SAFE] Cap 100 small por env├¡o (fuel ~6858 deut en ruta intergal├íctica)
                      SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', LEAST(GREATEST(v_small_cargo_count - 1, 0), 100))
                        WHERE v_small_cargo_count > 1
                      UNION ALL
                      -- [FUEL SAFE] Cap 100 large por env├¡o
                      SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', LEAST(v_large_cargo_count, 100))
                        WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0
                    ) x
                  ),`;

  // Try a cleaner match using ASCII (the prosrc may have different encoding). Let's just search for the key pattern.
  const startMarker = `SELECT jsonb_agg(x) FROM (`;
  const startIdx = src.indexOf(startMarker);
  if (startIdx < 0) { console.error('start marker not found'); process.exit(1); }
  // find next ") x" followed by any whitespace and "),"
  const after = src.substring(startIdx);
  const m = after.match(/\)\s*x\s*\n\s*\),/);
  if (!m) { console.error('end pattern not matched'); process.exit(1); }
  const endIdx = startIdx + m.index + m[0].length;

  const oldBlock = src.substring(startIdx, endIdx);
  console.log('=== OLD BLOCK ===');
  console.log(oldBlock);

  // Build fixed block: alias AS obj, and jsonb_agg(obj)
  const fixed = `SELECT jsonb_agg(obj) FROM (
                      SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', LEAST(GREATEST(v_small_cargo_count - 1, 0), 100)) AS obj
                        WHERE v_small_cargo_count > 1
                      UNION ALL
                      SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', LEAST(v_large_cargo_count, 100)) AS obj
                        WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0
                    ) sub
                  ),`;

  const newSrc = src.substring(0, startIdx) + fixed + src.substring(endIdx);

  console.log('\n=== NEW BLOCK ===');
  console.log(fixed);

  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];

  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${newSrc}\n$BOTAITICK$;`;

  fs.writeFileSync('scripts/_bot_ai_tick_jsonb_fix.sql', sql);
  console.log('Wrote SQL, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ Function updated with jsonb alias fix');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }

  await c.end();
})();
