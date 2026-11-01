// Parche: limitar producción de espionage_probe en bot_ai_tick
// Antes: hasta 10 sondas por planeta por tick, sin cap total → cientos al día
// Después:
//   - máximo 2 sondas por construcción (en lugar de 10)
//   - skip total si el planeta ya tiene >= 4 sondas (suficiente para espiar)

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

  // 1) Reducir cantidad por tick: 10 → 2
  const oldProbe = `WHEN 'espionage_probe' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 500.0)::int));`;
  const newProbe = `WHEN 'espionage_probe' THEN
                -- Cap: máximo 4 sondas por planeta (suficiente para espionaje normal).
                -- Si ya tiene 4+, no construir más. Si tiene <4, encolar máx 2 por tick.
                IF v_existing_ship_count >= 4 THEN
                  v_ship_qty := 0;
                ELSE
                  v_ship_qty := LEAST(2, 4 - v_existing_ship_count);
                END IF;`;

  if (!src.includes(oldProbe)) {
    console.log('❌ No se encontró el patrón original. Abortando.');
    await client.end();
    process.exit(1);
  }

  src = src.replace(oldProbe, newProbe);
  console.log('✅ Patrón reemplazado en bot_ai_tick');

  // Recrear la función
  const sig = await client.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args,
           pg_get_function_result(oid) AS result
    FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
  `);
  const sql = `
    CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
    RETURNS ${sig.rows[0].result}
    LANGUAGE plpgsql
    AS $FUNC$
${src}
$FUNC$
  `;
  await client.query(sql);
  console.log('✅ bot_ai_tick recompilado');

  // Test
  console.log('\n=== Test tick ===');
  try {
    const r = await client.query(`SELECT bot_ai_tick()`);
    console.log('  Resultado:', JSON.stringify(r.rows[0].bot_ai_tick));
  } catch (e) {
    console.log('  ❌', e.message);
  }

  // Mostrar sondas actuales por bot top 5
  console.log('\n=== TOP 5 bots con más sondas (planet_ships) ===');
  const top = await client.query(`
    SELECT pr.username, COUNT(DISTINCT p.id) AS planets,
           SUM(ps.quantity)::int AS total_probes,
           ROUND(AVG(ps.quantity)::numeric, 1) AS avg_per_planet
    FROM planet_ships ps
    JOIN ship_types st ON st.id = ps.ship_type_id
    JOIN planets p ON p.id = ps.planet_id
    JOIN profiles pr ON pr.id = p.user_id
    WHERE st.code = 'espionage_probe' AND ps.quantity > 0
      AND (pr.is_bot = true OR pr.autopilot_active = true)
    GROUP BY pr.username
    ORDER BY total_probes DESC
    LIMIT 5
  `);
  top.rows.forEach(t => console.log(`  ${t.username}: ${t.total_probes} sondas en ${t.planets} planetas (avg ${t.avg_per_planet}/planeta)`));

  // Opcional: bajar exceso actual
  console.log('\n=== Recortar exceso actual a máximo 4 por planeta ===');
  const trim = await client.query(`
    UPDATE planet_ships ps
    SET quantity = 4
    FROM ship_types st, planets p, profiles pr
    WHERE ps.ship_type_id = st.id AND st.code = 'espionage_probe'
      AND ps.planet_id = p.id AND p.user_id = pr.id
      AND (pr.is_bot = true OR pr.autopilot_active = true)
      AND ps.quantity > 4
    RETURNING ps.planet_id
  `);
  console.log(`  ✂️  Planetas recortados: ${trim.rowCount}`);

  await client.end();
}

main().catch(async e => {
  console.error('❌', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
