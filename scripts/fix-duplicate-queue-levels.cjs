// Fix: target_level debe considerar items ya en building_queue del mismo edificio
// para evitar duplicar (ej: Hangar L10 x3 en la misma cola).

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  // Buscar el bloque donde calcula v_target_level para edificios
  const re = /(SELECT COALESCE\(pb\.level, 0\) INTO v_current_level FROM planet_buildings pb WHERE pb\.planet_id = v_planet\.id AND pb\.building_type_id = v_try_bt\.id;\s*v_current_level := COALESCE\(v_current_level, 0\);\s*)v_target_level := v_current_level \+ 1;/;
  if (!re.test(src)) {
    console.log('❌ Regex no matchea');
    process.exit(1);
  }
  src = src.replace(re, `$1-- Considerar items ya en cola del mismo edificio para no duplicar niveles
              SELECT COALESCE(MAX(bq2.target_level), v_current_level)
                INTO v_target_level
                FROM building_queue bq2
                WHERE bq2.planet_id = v_planet.id AND bq2.building_type_id = v_try_bt.id;
              v_target_level := v_target_level + 1;`);

  const sig = await client.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args,
           pg_get_function_result(oid) AS result
    FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
    RETURNS ${sig.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$
  `);
  console.log('✅ bot_ai_tick parcheado: target_level ahora considera items en cola');

  // Limpiar duplicados actuales en la cola de dark
  console.log('\n=== Limpiar duplicados actuales en cola de dark ===');
  const dup = await client.query(`
    WITH ranked AS (
      SELECT bq.id, bq.planet_id, bq.building_type_id, bq.target_level,
             ROW_NUMBER() OVER (PARTITION BY bq.planet_id, bq.building_type_id, bq.target_level
                                ORDER BY bq.queue_position) AS rn
      FROM building_queue bq
      JOIN planets p ON p.id = bq.planet_id
      WHERE p.user_id = (SELECT id FROM profiles WHERE email='dark@gmail.com')
    )
    DELETE FROM building_queue
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    RETURNING id
  `);
  console.log(`  Duplicados eliminados: ${dup.rowCount}`);

  // Ver cola ahora
  const q = await client.query(`
    SELECT p.name, bt.code, bq.target_level, bq.queue_position
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.user_id = (SELECT id FROM profiles WHERE email='dark@gmail.com')
    ORDER BY p.name, bq.queue_position
  `);
  console.log('\n=== Cola limpia dark ===');
  q.rows.forEach(r => console.log(`  ${r.name.padEnd(22)} #${r.queue_position} ${r.code} → L${r.target_level}`));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
