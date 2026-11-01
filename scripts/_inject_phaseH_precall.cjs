// Inject a phaseH_precall log showing the exact jsonb built for p_fleet_ships
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

  // Target: right after phaseH_attempt log, before the "IF (v_send_metal + ..." check we compute the jsonb and log it.
  // We'll inject BEFORE the "IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 1000 ELSE 5000 END) THEN"
  // inside miner branch.

  const marker = `IF (v_send_metal + v_send_crystal + v_send_deut) >= (CASE WHEN v_planet_role = 'miner' THEN 1000 ELSE 5000 END) THEN`;

  const inject = `-- [DEBUG precall] capture actual jsonb passed to secure_send_fleet
              PERFORM log_autopilot_event(v_bot.id, v_planet.id, 'phaseH_precall', jsonb_build_object(
                'fleet_jsonb', (
                  SELECT jsonb_agg(x) FROM (
                    SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', LEAST(GREATEST(v_small_cargo_count - 1, 0), 100))
                      WHERE v_small_cargo_count > 1
                    UNION ALL
                    SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', LEAST(v_large_cargo_count, 100))
                      WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0
                  ) x
                ),
                'small_type_id', v_small_cargo_type_id,
                'large_type_id', v_large_cargo_type_id,
                'small_count', v_small_cargo_count,
                'large_count', v_large_cargo_count,
                'v_cargo_ship_capacity', v_cargo_ship_capacity,
                'send_m', v_send_metal, 'send_c', v_send_crystal, 'send_d', v_send_deut,
                'v_cargo_capacity', v_cargo_capacity,
                'res_metal', v_resources.metal, 'res_crystal', v_resources.crystal, 'res_deut', v_resources.deuterium
              ));
              ${marker}`;

  if (!src.includes(marker)) {
    console.error('MARKER NOT FOUND');
    process.exit(1);
  }
  // Only inject once
  if (src.includes('phaseH_precall')) {
    console.log('Already injected, replacing existing.');
  }

  const newSrc = src.replace(marker, inject);

  // Wrap into CREATE OR REPLACE FUNCTION
  const sigRes = await c.query(`SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret, l.lanname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  const { args, ret, lanname } = sigRes.rows[0];

  const sql = `CREATE OR REPLACE FUNCTION public.bot_ai_tick(${args}) RETURNS ${ret} LANGUAGE ${lanname} AS $BOTAITICK$\n${newSrc}\n$BOTAITICK$;`;

  fs.writeFileSync('scripts/_bot_ai_tick_precall_debug.sql', sql);
  console.log('Wrote SQL file, size:', sql.length);

  try {
    await c.query(sql);
    console.log('✅ Function updated with phaseH_precall log');
  } catch (e) {
    console.error('❌ Error:', e.message);
  }

  await c.end();
})();
