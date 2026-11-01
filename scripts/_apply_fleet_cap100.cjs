// Capea el envío de Phase H a 100 small + 100 large máximo por transporte
// (fuel ~6858 deut, siempre cabe en un minero activo).
const { Client } = require('pg');
const fs = require('fs');
const client = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});

(async () => {
  await client.connect();

  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public' LIMIT 1
  `);
  let src = fn.rows[0].prosrc;

  // Reemplazar el jsonb_build_array de Phase H miner: cap 100 small + 100 large por envío
  const oldFleet = `                  p_fleet_ships := (
                    SELECT jsonb_agg(x) FROM (
                      SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', GREATEST(v_small_cargo_count - 1, 0))
                      WHERE v_small_cargo_count > 1
                      UNION ALL
                      SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', v_large_cargo_count)
                      WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0
                    ) x
                  ),`;

  const newFleet = `                  p_fleet_ships := (
                    SELECT jsonb_agg(x) FROM (
                      -- [FUEL SAFE] Cap 100 small por envío (fuel ~6858 deut en ruta intergaláctica)
                      SELECT jsonb_build_object('ship_type_id', v_small_cargo_type_id, 'quantity', LEAST(GREATEST(v_small_cargo_count - 1, 0), 100))
                      WHERE v_small_cargo_count > 1
                      UNION ALL
                      -- [FUEL SAFE] Cap 100 large por envío
                      SELECT jsonb_build_object('ship_type_id', v_large_cargo_type_id, 'quantity', LEAST(v_large_cargo_count, 100))
                      WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0
                    ) x
                  ),`;

  if (!src.includes(oldFleet)) {
    console.log('❌ Bloque p_fleet_ships exacto no encontrado, probando flexible...');
    const re = /p_fleet_ships := \(\s*\n\s*SELECT jsonb_agg\(x\) FROM \(\s*\n\s*SELECT jsonb_build_object\('ship_type_id', v_small_cargo_type_id, 'quantity', GREATEST\(v_small_cargo_count - 1, 0\)\)\s*\n\s*WHERE v_small_cargo_count > 1\s*\n\s*UNION ALL\s*\n\s*SELECT jsonb_build_object\('ship_type_id', v_large_cargo_type_id, 'quantity', v_large_cargo_count\)\s*\n\s*WHERE v_planet_role = 'miner' AND v_large_cargo_count > 0\s*\n\s*\) x\s*\n\s*\),/;
    if (!re.test(src)) throw new Error('No match p_fleet_ships');
    src = src.replace(re, newFleet.trim());
  } else {
    src = src.replace(oldFleet, newFleet);
  }

  // Además ajustar v_cargo_capacity para que coincida con las naves realmente enviadas
  // (v_cargo_capacity se calcula con todos small+large; si metemos 525 en cargo pero sólo mandamos 100 naves,
  //  secure_send_fleet rechaza por capacidad insuficiente)
  const oldCap = `              IF v_planet_role = 'miner' THEN
                v_cargo_capacity := GREATEST(0, (v_small_cargo_count - 1))::bigint * v_cargo_ship_capacity
                                  + (v_large_cargo_count::bigint * v_cargo_ship_capacity * 5);`;
  const newCap = `              IF v_planet_role = 'miner' THEN
                -- [FUEL SAFE] capacidad limitada a las naves que realmente enviaremos (cap 100+100)
                v_cargo_capacity := LEAST(GREATEST(0, (v_small_cargo_count - 1)), 100)::bigint * v_cargo_ship_capacity
                                  + LEAST(v_large_cargo_count, 100)::bigint * v_cargo_ship_capacity * 5;`;

  if (!src.includes(oldCap)) {
    console.log('⚠️  Bloque v_cargo_capacity miner no encontrado con patrón exacto, usando regex...');
    const re2 = /IF v_planet_role = 'miner' THEN\s*\n\s*v_cargo_capacity := GREATEST\(0, \(v_small_cargo_count - 1\)\)::bigint \* v_cargo_ship_capacity\s*\n\s*\+ \(v_large_cargo_count::bigint \* v_cargo_ship_capacity \* 5\);/;
    if (!re2.test(src)) throw new Error('No match v_cargo_capacity');
    src = src.replace(re2, newCap.trim());
  } else {
    src = src.replace(oldCap, newCap);
  }

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC_FXU$
${src}
$FUNC_FXU$;
  `);

  const v = await client.query(`
    SELECT
      POSITION('[FUEL SAFE] Cap 100 small' IN prosrc) > 0 AS fleet_capped,
      POSITION('[FUEL SAFE] capacidad limitada' IN prosrc) > 0 AS capacity_capped
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
  `);
  console.log('✅ Fix aplicado:', v.rows[0]);

  const migration = `-- Fix Phase H: cap 100 small + 100 large por envío (fuel seguro intergaláctico)
CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
RETURNS ${fn.rows[0].result}
LANGUAGE plpgsql
AS $FUNC_FXU$
${src}
$FUNC_FXU$;
`;
  fs.writeFileSync('supabase/migrations/20260422_miner_fleet_cap100.sql', migration);
  console.log('📄 Migración: supabase/migrations/20260422_miner_fleet_cap100.sql');

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
