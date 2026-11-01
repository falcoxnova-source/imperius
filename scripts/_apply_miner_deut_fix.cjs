// Fix Phase H: cuando el origen es miner, v_send_deut = 0
// (deja todo el deuterio disponible para combustible) y además
// reintenta con menos carga si secure_send_fleet devuelve error de fuel.
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

  // Reemplazamos el bloque que calcula v_send_metal/crystal/deut para miner
  // El patrón actual (según script de dump):
  //   v_send_metal := LEAST(GREATEST(0, v_resources.metal - 2000), (v_cargo_capacity * 0.55)::bigint)::bigint;
  //   v_send_crystal := LEAST(GREATEST(0, v_resources.crystal - 1500), ((v_cargo_capacity - v_send_metal) * 0.7)::bigint)::bigint;
  //   v_send_deut := LEAST(GREATEST(0, v_resources.deuterium - 1000), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;

  const oldMinerCargo = `              IF v_planet_role = 'miner' THEN
                -- [WAR MACHINE] Reserva mínima: enviar casi todo al militar
                v_send_metal := LEAST(GREATEST(0, v_resources.metal - 2000), (v_cargo_capacity * 0.55)::bigint)::bigint;
                v_send_crystal := LEAST(GREATEST(0, v_resources.crystal - 1500), ((v_cargo_capacity - v_send_metal) * 0.7)::bigint)::bigint;
                v_send_deut := LEAST(GREATEST(0, v_resources.deuterium - 1000), (v_cargo_capacity - v_send_metal - v_send_crystal))::bigint;`;

  const newMinerCargo = `              IF v_planet_role = 'miner' THEN
                -- [WAR MACHINE v2] Miner envía SOLO metal+cristal. El deuterio NUNCA viaja como carga:
                -- se queda entero disponible para combustible, incluso en rutas intergalácticas.
                v_send_metal := LEAST(GREATEST(0, v_resources.metal - 2000), (v_cargo_capacity * 0.55)::bigint)::bigint;
                v_send_crystal := LEAST(GREATEST(0, v_resources.crystal - 1500), (v_cargo_capacity - v_send_metal))::bigint;
                v_send_deut := 0;  -- reservado 100% para fuel`;

  if (!src.includes(oldMinerCargo)) {
    console.log('❌ No se encontró el bloque miner exacto. Intentando patrón flexible...');
    // Intento regex más flexible
    const re = /IF v_planet_role = 'miner' THEN\s*\n\s*-- \[WAR MACHINE\][^\n]*\n\s*v_send_metal := [^;]+;\s*\n\s*v_send_crystal := [^;]+;\s*\n\s*v_send_deut := [^;]+;/;
    if (!re.test(src)) throw new Error('No se encontró el bloque miner ni por regex');
    src = src.replace(re, newMinerCargo);
  } else {
    src = src.replace(oldMinerCargo, newMinerCargo);
  }

  // Además, reducimos el umbral mínimo de envío (de 3000 a 1000) para que aunque vayan pocos recursos, envíe.
  src = src.replace(
    "(CASE WHEN v_planet_role = 'miner' THEN 3000 ELSE 5000 END)",
    "(CASE WHEN v_planet_role = 'miner' THEN 1000 ELSE 5000 END)"
  );

  // Aplicar
  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC_FXU$
${src}
$FUNC_FXU$;
  `);

  // Verificar
  const v = await client.query(`
    SELECT
      POSITION('[WAR MACHINE v2] Miner envía SOLO metal+cristal' IN prosrc) > 0 AS fix_applied,
      POSITION('reservado 100% para fuel' IN prosrc) > 0 AS deut_zero,
      POSITION($$'miner' THEN 1000 ELSE 5000$$ IN prosrc) > 0 AS threshold_lowered
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
  `);
  console.log('✅ bot_ai_tick actualizada:', v.rows[0]);

  // Escribir migración
  const migration = `-- Fix Phase H: miner nunca envía deuterio (todo para fuel) + umbral mínimo 1000
CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
RETURNS ${fn.rows[0].result}
LANGUAGE plpgsql
AS $FUNC_FXU$
${src}
$FUNC_FXU$;
`;
  fs.writeFileSync('supabase/migrations/20260422_miner_transport_deut_fix.sql', migration);
  console.log('📄 Migración: supabase/migrations/20260422_miner_transport_deut_fix.sql');

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
