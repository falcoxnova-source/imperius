const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

function replaceOrThrow(src, pattern, replacement, label) {
  if (!pattern.test(src)) throw new Error('No match: ' + label);
  return src.replace(pattern, replacement);
}

(async () => {
  await client.connect();
  console.log('🚚 Actualizando bot_ai_tick: mineros cap 50 small + 50 large...');

  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS result
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public' LIMIT 1
  `);
  if (!fn.rows.length) throw new Error('bot_ai_tick no existe');

  let src = fn.rows[0].prosrc;

  // 1) Añadir small_cargo al array de prioridad del miner
  src = replaceOrThrow(
    src,
    /ELSIF v_planet_role = 'miner' THEN\s*\n\s*-- \[MINER\] Solo log[^\n]*\n\s*v_max_ship_types_per_tick := 3;\s*\n\s*v_ship_priority := ARRAY\[\s*\n\s*'large_cargo',\s*\n\s*'solar_satellite'\s*\n\s*\];/,
    `ELSIF v_planet_role = 'miner' THEN
            -- [MINER] Solo cargueros (50 small + 50 large) y soporte energético. NO combate, NO recicladores, NO sondas.
            v_max_ship_types_per_tick := 3;
            v_ship_priority := ARRAY[
              'small_cargo',
              'large_cargo',
              'solar_satellite'
            ];`,
    'miner ship_priority (añadir small_cargo)'
  );

  // 2) small_cargo cap miner: 20 -> 50
  src = replaceOrThrow(
    src,
    /WHEN 'small_cargo' THEN\s*\n\s*-- Caps por rol: miner 20, militar 80, colonizer 15\s*\n\s*IF v_planet_role = 'miner' THEN\s*\n\s*IF v_existing_ship_count >= 20 THEN\s*\n\s*v_ship_qty := 0;\s*\n\s*ELSE\s*\n\s*v_ship_qty := LEAST\(10, 20 - v_existing_ship_count\);\s*\n\s*END IF;/,
    `WHEN 'small_cargo' THEN
                -- Caps por rol: miner 50 (fijo - transporte al militar), militar 80, colonizer 15
                IF v_planet_role = 'miner' THEN
                  IF v_existing_ship_count >= 50 THEN
                    v_ship_qty := 0;
                  ELSE
                    v_ship_qty := LEAST(10, 50 - v_existing_ship_count);
                  END IF;`,
    'small_cargo miner cap 50'
  );

  // 3) large_cargo cap miner: 100 -> 50
  src = replaceOrThrow(
    src,
    /WHEN 'large_cargo' THEN\s*\n\s*-- Caps por rol: miner 100, militar 60\s*\n\s*IF v_planet_role = 'miner' THEN\s*\n\s*IF v_existing_ship_count >= 100 THEN\s*\n\s*v_ship_qty := 0;\s*\n\s*ELSE\s*\n\s*v_ship_qty := LEAST\(15, 100 - v_existing_ship_count\);\s*\n\s*END IF;/,
    `WHEN 'large_cargo' THEN
                -- Caps por rol: miner 50 (fijo - transporte al militar), militar 60
                IF v_planet_role = 'miner' THEN
                  IF v_existing_ship_count >= 50 THEN
                    v_ship_qty := 0;
                  ELSE
                    v_ship_qty := LEAST(10, 50 - v_existing_ship_count);
                  END IF;`,
    'large_cargo miner cap 50'
  );

  await client.query(`
    CREATE OR REPLACE FUNCTION public.bot_ai_tick(${fn.rows[0].args})
    RETURNS ${fn.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC_FXU$
${src}
$FUNC_FXU$;
  `);
  console.log('✅ bot_ai_tick actualizada');

  // Verificación
  const v = await client.query(`
    SELECT
      POSITION($$miner 50 (fijo - transporte al militar), militar 80$$ IN p.prosrc) > 0 AS small_cap_50,
      POSITION($$miner 50 (fijo - transporte al militar), militar 60$$ IN p.prosrc) > 0 AS large_cap_50,
      POSITION($$[MINER] Solo cargueros (50 small + 50 large)$$ IN p.prosrc) > 0 AS priority_updated
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='bot_ai_tick' AND n.nspname='public'
  `);
  console.log('Verificación:', v.rows[0]);

  // Dump a fichero de referencia
  require('fs').writeFileSync('scripts/_bot_ai_tick_after_cap50.sql', src);
  console.log('📄 Dump en scripts/_bot_ai_tick_after_cap50.sql');

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
