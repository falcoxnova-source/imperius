// Hacer flotas más robustas:
// - Quitar el EXIT después del primer tipo de nave
// - Limitar a 3-4 tipos diferentes por tick por planeta (para no agotar recursos)
// - Mantener prioridades aleatorias para variedad

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

  // Buscar el bloque de inserción de naves y cambiar el comportamiento:
  // ANTES: encola 1 tipo de nave y hace EXIT
  // DESPUÉS: encola hasta N tipos de naves distintos por tick, hasta quedarse sin recursos
  
  // Añadir contador de tipos encolados ANTES del FOR
  const oldLoopStart = `IF NOT v_shipyard_busy THEN
          -- Flota estratégica aleatoria: cada tick elige un enfoque distinto`;

  if (!src.includes(oldLoopStart)) {
    throw new Error('No se encontró inicio del loop');
  }

  src = src.replace(oldLoopStart, `IF NOT v_shipyard_busy THEN
          -- Contador: cuántos tipos distintos encolar en este tick
          -- 3-5 tipos para flotas robustas y variadas
          v_ship_types_queued_this_tick := 0;
          v_max_ship_types_per_tick := CASE
            WHEN random() < 0.3 THEN 3
            WHEN random() < 0.7 THEN 4
            ELSE 5
          END;
          -- Flota estratégica aleatoria: cada tick elige un enfoque distinto`);

  // Declarar las variables al principio de la función (siempre, no con guard)
  const declareMarker = `v_small_cargo_type_id integer;`;
  const newDeclare = `v_small_cargo_type_id integer;
  v_ship_types_queued_this_tick integer := 0;
  v_max_ship_types_per_tick integer := 3;`;
  if (!src.includes('v_ship_types_queued_this_tick integer')) {
    src = src.replace(declareMarker, newDeclare);
    console.log('  → Variables declaradas');
  } else {
    console.log('  → Variables ya declaradas (skip)');
  }

  // Ahora reemplazar el EXIT tras INSERT de shipyard_queue por un contador
  // El bloque original es así (aprox):
  //   INSERT INTO shipyard_queue (...) VALUES (...);
  //   v_ships_queued := v_ships_queued + 1;
  //   SELECT * INTO v_resources FROM planet_resources ...;
  //   EXIT;
  // Regex tolerante a whitespace: busca el bloque específico del shipyard (no el de research ni el de defenses)
  const exitRegex = /(v_ships_queued\s*:=\s*v_ships_queued\s*\+\s*1;\s*SELECT\s*\*\s*INTO\s*v_resources\s*FROM\s*planet_resources\s*WHERE\s*planet_id\s*=\s*v_planet\.id;\s*)EXIT;/;
  const match = src.match(exitRegex);
  if (!match) {
    throw new Error('EXIT no encontrado (regex)');
  }
  const replacement = `$1v_ship_types_queued_this_tick := v_ship_types_queued_this_tick + 1;
              IF v_ship_types_queued_this_tick >= v_max_ship_types_per_tick THEN EXIT; END IF;`;
  src = src.replace(exitRegex, replacement);

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
  console.log('✅ bot_ai_tick: ahora encola 3-5 tipos distintos de naves por planeta por tick');

  // Test
  console.log('\n=== Test tick ===');
  const t = await client.query(`SELECT bot_ai_tick()`);
  console.log(JSON.stringify(t.rows[0].bot_ai_tick));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
