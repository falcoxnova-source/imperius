// Parche crítico para autopiloto:
// 1. Crear planet_resources faltante para Nueva Terra (dark@gmail.com)
// 2. Parchear bot_ai_tick para filtrar mensajes con body no-JSON (error "Tus")

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

const STORAGE_L10 = Math.floor(5000 * Math.floor(2.5 * Math.exp((20 * 10) / 33)));

async function main() {
  await client.connect();

  // ============================================
  // FIX 1: Nueva Terra sin planet_resources
  // ============================================
  console.log('=== FIX 1: planet_resources faltantes ===');
  const missing = await client.query(`
    SELECT p.id, p.name FROM planets p
    LEFT JOIN planet_resources pr ON pr.planet_id = p.id
    WHERE pr.planet_id IS NULL
      AND p.user_id = (SELECT id FROM profiles WHERE email='dark@gmail.com')
      AND NOT p.is_destroyed
  `);
  console.log(`Planetas sin resources: ${missing.rows.length}`);
  for (const p of missing.rows) {
    await client.query(`
      INSERT INTO planet_resources (
        planet_id, metal, crystal, deuterium, energy_used, energy_max,
        metal_per_hour, crystal_per_hour, deuterium_per_hour,
        metal_storage, crystal_storage, deuterium_storage,
        last_update,
        metal_mine_percent, crystal_mine_percent, deuterium_synth_percent,
        solar_plant_percent, fusion_reactor_percent, solar_satellite_percent
      ) VALUES (
        $1, $2, $2, $2, 0, 0,
        0, 0, 0,
        $2, $2, $2,
        now(),
        100, 100, 100, 100, 100, 100
      )
    `, [p.id, STORAGE_L10]);
    console.log(`  ✅ ${p.name}: planet_resources creado con ${STORAGE_L10.toLocaleString()} c/u`);
  }

  // ============================================
  // FIX 2: Parchear bot_ai_tick para filtrar body no-JSON
  // ============================================
  console.log('\n=== FIX 2: Filtro de mensajes body no-JSON en bot_ai_tick ===');
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  // Ubicar las líneas problemáticas y añadir un filtro de body JSON válido.
  // Patrón: "m.message_type = 'espionage'" aparece 3 veces (spy block, attack block, recycle block)
  // Insertamos un AND después de cada aparición del filtro de espionage.
  const marker = `m.message_type = 'espionage'`;
  const addition = `m.message_type = 'espionage' AND m.body ~ '^\\s*\\{'`;
  const count = (src.match(/m\.message_type = 'espionage'/g) || []).length;
  console.log(`Ocurrencias de "message_type='espionage'": ${count}`);

  if (count === 0) {
    console.log('⚠️  No se encontró el marker, no se aplica parche JSON');
  } else {
    const patched = src.split(marker).join(addition);
    // Recrear la función completa
    // Necesitamos obtener la firma completa
    const sig = await client.query(`
      SELECT pg_get_function_identity_arguments(oid) AS args,
             pg_get_function_result(oid) AS result
      FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
    `);
    const args = sig.rows[0].args;
    const result = sig.rows[0].result;

    const sql = `
      CREATE OR REPLACE FUNCTION bot_ai_tick(${args})
      RETURNS ${result}
      LANGUAGE plpgsql
      AS $FUNC$
${patched}
$FUNC$
    `;
    await client.query(sql);
    console.log('  ✅ bot_ai_tick parcheado: ahora ignora mensajes con body no-JSON');
  }

  // ============================================
  // FIX 3: Ejecutar bot_ai_tick AHORA para verificar
  // ============================================
  console.log('\n=== FIX 3: Ejecutar bot_ai_tick de prueba ===');
  try {
    const res = await client.query(`SELECT bot_ai_tick()`);
    console.log('  ✅ bot_ai_tick ejecutado sin error');
    console.log('  Resultado:', JSON.stringify(res.rows[0], null, 2).slice(0, 500));
  } catch (e) {
    console.log('  ❌ bot_ai_tick falló:', e.message);
  }

  // ============================================
  // VERIFICACIÓN: colas de dark después del tick
  // ============================================
  console.log('\n=== VERIFICACIÓN: colas de dark ===');
  const queues = await client.query(`
    SELECT p.name, bt.code, bq.target_level, bq.end_time
    FROM building_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.user_id = (SELECT id FROM profiles WHERE email='dark@gmail.com')
    ORDER BY p.name, bq.queue_position
  `);
  if (queues.rows.length === 0) {
    console.log('  (sin cola por ahora - esperar siguiente tick)');
  } else {
    queues.rows.forEach(q => console.log(`  🔨 ${q.name}: ${q.code} → L${q.target_level}`));
  }

  await client.end();
}

main().catch(async e => {
  console.error('❌ Error:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
