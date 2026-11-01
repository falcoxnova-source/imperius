/**
 * Patch adicional: cuando el planeta tiene SUPERÁVIT alto de energía
 * (energy_max >= energy_used * 1.5), priorizar minas al frente de la lista
 * para acelerar producción de recursos. Cierra el ciclo del gestor inteligente.
 *
 * Se inserta justo después del bloque "IF v_energy_balance < 0 THEN ... END IF;"
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

  // Anclaje: cierre del IF v_energy_balance < 0 THEN ... END IF;
  // Insertamos un ELSIF equivalente tras el END IF.
  const needle = /(v_building_wish_list := v_filtered_wish;\r?\n\s*END IF;)(\r?\n)/;
  if (!needle.test(src)) throw new Error('no encontré cierre del bloque energético');

  if (src.includes('-- [AUTOPILOT/BOT] Si hay superávit alto')) {
    console.log('⚠️  Ya estaba parcheado, no hago nada');
    await c.end();
    return;
  }

  src = src.replace(needle, `$1

            -- [AUTOPILOT/BOT] Si hay superávit alto de energía (>=50% de margen),
            -- priorizar minas agresivamente para acelerar producción.
            IF v_energy_balance > 0 AND v_energy_balance >= GREATEST(10, (
                 SELECT COALESCE(energy_used, 0) * 0.5 FROM planet_resources WHERE planet_id = v_planet.id
               )) THEN
              v_filtered_wish := ARRAY[]::text[];
              -- Minas primero, ordenadas por rentabilidad relativa según puntos
              IF v_metal_mine_lvl <= v_crystal_mine_lvl + 2 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'metal_mine');
                v_filtered_wish := array_append(v_filtered_wish, 'crystal_mine');
              ELSE
                v_filtered_wish := array_append(v_filtered_wish, 'crystal_mine');
                v_filtered_wish := array_append(v_filtered_wish, 'metal_mine');
              END IF;
              IF v_crystal_mine_lvl >= 4 THEN
                v_filtered_wish := array_append(v_filtered_wish, 'deuterium_synthesizer');
              END IF;
              -- Luego el resto de la wishlist original sin duplicar
              FOREACH v_wish_item IN ARRAY v_building_wish_list LOOP
                IF NOT (v_wish_item = ANY(v_filtered_wish)) THEN
                  v_filtered_wish := array_append(v_filtered_wish, v_wish_item);
                END IF;
              END LOOP;
              v_building_wish_list := v_filtered_wish;
            END IF;
$2`);

  const funcDef = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='bot_ai_tick'`);
  const fullDef = funcDef.rows[0].def;
  const original = r.rows[0].prosrc;
  if (!fullDef.includes(original)) throw new Error('no pude localizar prosrc original');
  const newDef = fullDef.replace(original, src);

  await c.query(newDef);
  console.log('✅ Parche de superávit aplicado');

  // Validación + ejecución
  console.log('\n=== Ejecutando bot_ai_tick() ===');
  const t = await c.query('SELECT bot_ai_tick() AS r');
  console.log(JSON.stringify(t.rows[0].r, null, 2));

  console.log('\n=== Distribución de edificios encolados a bots (último 1 min) ===');
  const q = await c.query(`
    SELECT bt.code,
           COUNT(*)::int AS total,
           SUM(CASE WHEN pres.energy_max - pres.energy_used < 0 THEN 1 ELSE 0 END)::int AS deficit,
           SUM(CASE WHEN pres.energy_max >= pres.energy_used * 1.5 AND pres.energy_used > 0 THEN 1 ELSE 0 END)::int AS surplus
    FROM building_queue bq
    JOIN planets p ON p.id=bq.planet_id
    JOIN profiles pr ON pr.id=p.user_id
    JOIN building_types bt ON bt.id=bq.building_type_id
    JOIN planet_resources pres ON pres.planet_id=p.id
    WHERE (pr.is_bot=true OR pr.autopilot_active=true)
      AND bq.start_time > now() - interval '1 minute'
    GROUP BY bt.code
    ORDER BY total DESC
  `);
  console.table(q.rows);

  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
