/**
 * Patch: hacer que bots/autopilot prioricen la energía cuando el planeta
 * está en déficit (energy_production - energy_consumption < 0).
 *
 * Cambios sobre bot_ai_tick():
 *  1. Declarar v_energy_balance numeric y v_filtered_wish text[]
 *  2. Leer energy_production - energy_consumption desde planet_resources
 *  3. Si hay déficit:
 *      - Forzar solar_plant al frente de la wish list
 *      - Añadir fusion_reactor si el planeta ya tiene synth de deut >= 5
 *      - Filtrar metal_mine / crystal_mine / deuterium_synthesizer (no sube consumo hasta tener energía)
 */
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  let src = r.rows[0].prosrc;

  // 1) Añadir declaraciones nuevas tras v_deut_tank_lvl integer := 0;
  const needle1 = /(\r?\n\s*v_deut_tank_lvl integer := 0;\r?\n\s*v_try_bt RECORD;)/;
  if (!needle1.test(src)) throw new Error('No encontré el bloque de declaraciones esperado (1)');
  src = src.replace(needle1, `$1
            v_energy_balance numeric := 0;
            v_filtered_wish text[];
            v_wish_item text;`);

  // 2) Leer energy_balance después de leer v_deut_tank_lvl
  // El último SELECT de niveles es el de deut_tank
  const needle2 = /(SELECT COALESCE\(pb\.level, 0\) INTO v_deut_tank_lvl FROM planet_buildings pb JOIN building_types bt ON bt\.id = pb\.building_type_id WHERE pb\.planet_id = v_planet\.id AND bt\.code = 'deuterium_tank';\r?\n\s*v_deut_tank_lvl := COALESCE\(v_deut_tank_lvl, 0\);)/;
  if (!needle2.test(src)) throw new Error('No encontré el SELECT de deut_tank');
  src = src.replace(needle2, `$1

            -- [AUTOPILOT/BOT] Leer balance energético del planeta
            SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)
              INTO v_energy_balance
              FROM planet_resources
              WHERE planet_id = v_planet.id;
            v_energy_balance := COALESCE(v_energy_balance, 0);`);

  // 3) Después de construir la wish_list (último array_append de 'solar_plant'),
  //    y antes del cálculo de v_build_slots_left, aplicar filtro de energía.
  const needle3 = /(v_building_wish_list := array_append\(v_building_wish_list, 'solar_plant'\);\r?\n\s*)(v_build_slots_left := GREATEST\(0, v_max_build_queue - v_queued_count\);)/;
  if (!needle3.test(src)) throw new Error('No encontré el anclaje post-wishlist');
  src = src.replace(needle3, `$1
            -- [AUTOPILOT/BOT] Si hay déficit de energía, priorizar energía y
            -- saltar edificios que aumentan consumo (minas / sintetizador).
            IF v_energy_balance < 0 THEN
              v_filtered_wish := ARRAY['solar_plant']::text[];
              -- Añadir fusion_reactor si ya tiene deut_synth >= 5 (ya desbloqueable realista)
              IF v_deut_synth_lvl >= 5 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'fusion_reactor');
              END IF;
              FOREACH v_wish_item IN ARRAY v_building_wish_list LOOP
                IF v_wish_item IN ('metal_mine', 'crystal_mine', 'deuterium_synthesizer') THEN
                  CONTINUE; -- no sumar más consumo hasta tener energía
                END IF;
                IF NOT (v_wish_item = ANY(v_filtered_wish)) THEN
                  v_filtered_wish := array_append(v_filtered_wish, v_wish_item);
                END IF;
              END LOOP;
              v_building_wish_list := v_filtered_wish;
            END IF;

            $2`);

  // Volcar la función entera con CREATE OR REPLACE
  const funcDef = await c.query(`
    SELECT pg_get_functiondef(oid) AS def
    FROM pg_proc WHERE proname = 'bot_ai_tick'
  `);
  const fullDef = funcDef.rows[0].def;
  // Reemplazar el prosrc original por el parcheado dentro de la definición
  const original = r.rows[0].prosrc;
  if (!fullDef.includes(original)) throw new Error('No pude localizar el prosrc original dentro de pg_get_functiondef');
  const newDef = fullDef.replace(original, src);

  console.log('Aplicando parche...');
  await c.query(newDef);
  console.log('✅ Parche de energía aplicado correctamente');

  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
