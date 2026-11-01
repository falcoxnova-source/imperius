// Parche: hacer la flota del autopiloto/NPC más estratégica y variada
// - Evita sesgo extremo a light_fighter
// - Introduce modos aleatorios por tick (economía/ataque/balanceado)
// - Prioriza naves más poderosas cuando están disponibles

const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const fnRes = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fnRes.rows[0].prosrc;

  const oldPriorityRegex = /IF NOT v_shipyard_busy THEN\s+v_ship_priority := ARRAY\[[\s\S]*?\];/;
  const newPriorityBlock = `IF NOT v_shipyard_busy THEN
          -- Flota estratégica aleatoria: cada tick elige un enfoque distinto
          -- 1) Economía/soporte (transporte + reciclaje)
          -- 2) Ataque pesado
          -- 3) Balanceado
          IF random() < 0.33 THEN
            v_ship_priority := ARRAY[
              'small_cargo',
              'large_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship',
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'heavy_fighter',
              'light_fighter'
            ];
          ELSIF random() < 0.66 THEN
            v_ship_priority := ARRAY[
              'cruiser',
              'battleship',
              'battlecruiser',
              'destroyer',
              'bomber',
              'heavy_fighter',
              'light_fighter',
              'large_cargo',
              'small_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship'
            ];
          ELSE
            v_ship_priority := ARRAY[
              'heavy_fighter',
              'cruiser',
              'battleship',
              'battlecruiser',
              'small_cargo',
              'large_cargo',
              'recycler',
              'espionage_probe',
              'colony_ship',
              'destroyer',
              'bomber',
              'light_fighter'
            ];
          END IF;`;

  if (!oldPriorityRegex.test(src)) {
    throw new Error('No se encontró bloque de prioridad de naves para reemplazar');
  }
  src = src.replace(oldPriorityRegex, newPriorityBlock);

  // Reducir sesgo de cazas ligeros y subir foco en naves medias/pesadas
  src = src.replace(
    "WHEN 'light_fighter' THEN v_ship_qty := GREATEST(2, LEAST(50, FLOOR(v_bot_points / 100.0)::int));",
    "WHEN 'light_fighter' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 250.0)::int));"
  );
  src = src.replace(
    "WHEN 'heavy_fighter' THEN v_ship_qty := GREATEST(1, LEAST(30, FLOOR(v_bot_points / 200.0)::int));",
    "WHEN 'heavy_fighter' THEN v_ship_qty := GREATEST(1, LEAST(16, FLOOR(v_bot_points / 220.0)::int));"
  );
  src = src.replace(
    "WHEN 'cruiser' THEN v_ship_qty := GREATEST(1, LEAST(20, FLOOR(v_bot_points / 400.0)::int));",
    "WHEN 'cruiser' THEN v_ship_qty := GREATEST(1, LEAST(12, FLOOR(v_bot_points / 450.0)::int));"
  );
  src = src.replace(
    "WHEN 'battleship' THEN v_ship_qty := GREATEST(1, LEAST(15, FLOOR(v_bot_points / 600.0)::int));",
    "WHEN 'battleship' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 700.0)::int));"
  );
  src = src.replace(
    "WHEN 'battlecruiser' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 800.0)::int));",
    "WHEN 'battlecruiser' THEN v_ship_qty := GREATEST(1, LEAST(8, FLOOR(v_bot_points / 900.0)::int));"
  );
  src = src.replace(
    "WHEN 'destroyer' THEN v_ship_qty := GREATEST(1, LEAST(8, FLOOR(v_bot_points / 1000.0)::int));",
    "WHEN 'destroyer' THEN v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1200.0)::int));"
  );
  src = src.replace(
    "WHEN 'bomber' THEN v_ship_qty := GREATEST(1, LEAST(10, FLOOR(v_bot_points / 800.0)::int));",
    "WHEN 'bomber' THEN v_ship_qty := GREATEST(1, LEAST(6, FLOOR(v_bot_points / 1100.0)::int));"
  );

  const sig = await client.query(`
    SELECT pg_get_function_identity_arguments(oid) AS args,
           pg_get_function_result(oid) AS result
    FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1
  `);

  const recreateSql = `
CREATE OR REPLACE FUNCTION bot_ai_tick(${sig.rows[0].args})
RETURNS ${sig.rows[0].result}
LANGUAGE plpgsql
AS $FUNC$
${src}
$FUNC$;
`;

  await client.query(recreateSql);
  console.log('✅ bot_ai_tick parcheado con flota estratégica aleatoria');

  const tick = await client.query('SELECT bot_ai_tick()');
  console.log('✅ Tick de prueba:', JSON.stringify(tick.rows[0].bot_ai_tick));

  const topQueued = await client.query(`
    SELECT st.code, COUNT(*)::int AS queued_count, SUM(sq.quantity)::int AS units
    FROM shipyard_queue sq
    JOIN ship_types st ON st.id = sq.ship_type_id
    WHERE sq.item_type='ship' AND sq.created_at >= NOW() - INTERVAL '30 minutes'
    GROUP BY st.code
    ORDER BY units DESC
    LIMIT 12
  `);
  console.log('\n=== Naves encoladas últimos 30 min ===');
  topQueued.rows.forEach(r => console.log(`  ${r.code}: colas=${r.queued_count}, unidades=${r.units}`));

  await client.end();
}

main().catch(async (e) => {
  console.error('❌ Error:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
