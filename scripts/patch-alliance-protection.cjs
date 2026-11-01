// Añadir filtro de alianza en bot_ai_tick: NO espiar ni atacar a miembros
// de la misma alianza que el bot/autopilot.

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

  // Filtro SQL común a insertar después de "pr.is_bot = false" en las queries de objetivos
  const allianceFilter = `
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = tp.user_id
              )`;

  // Las 3 queries principales que seleccionan objetivos usan el patrón "AND pr.is_bot = false"
  // Buscar cada ocurrencia y añadir el filtro justo después
  const lines = src.split('\n');
  let modified = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('AND pr.is_bot = false')) {
      // Insertar filtro de alianza justo después
      if (!lines[i+1] || !lines[i+1].includes('alliance_members am_self')) {
        lines.splice(i + 1, 0, allianceFilter);
        modified++;
        i += 7; // saltar las líneas recién insertadas
      }
    }
  }
  src = lines.join('\n');
  console.log(`✅ Filtro de alianza insertado en ${modified} queries de objetivos`);

  // Recrear función
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
  console.log('✅ bot_ai_tick recompilado');

  // Test
  const t = await client.query(`SELECT bot_ai_tick()`);
  console.log('\nTick de prueba:', JSON.stringify(t.rows[0].bot_ai_tick));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
