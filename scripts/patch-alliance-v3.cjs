// v3: reemplazos exactos sin splice, usando el bloque COMPLETO desde "AND pr.is_bot = false\n" (vacía) hasta la siguiente línea real

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // Limpiar cualquier parche previo roto
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  // Eliminar bloques alliance_members am_self mal formados que pudieran haber quedado
  // Patrón conservador: el bloque completo del filtro (6 líneas fijas)
  const allyRegex = /\n\s+AND NOT EXISTS \(\s*\n\s+SELECT 1 FROM alliance_members am_self\s*\n\s+JOIN alliance_members am_tgt ON am_tgt\.alliance_id = am_self\.alliance_id\s*\n\s+WHERE am_self\.user_id = v_bot\.id\s*\n\s+AND am_tgt\.user_id = [^\n]+\s*\n\s+\)/g;
  const before = src.length;
  src = src.replace(allyRegex, '');
  console.log(`🧹 Caracteres removidos: ${before - src.length}`);

  // Función para inyectar filtro de alianza después de un ancla específica
  function injectAfter(anchor, filterBlock) {
    const idx = src.indexOf(anchor);
    if (idx === -1) return false;
    const insertAt = idx + anchor.length;
    src = src.slice(0, insertAt) + filterBlock + src.slice(insertAt);
    return true;
  }

  // 3 queries con planets tp — ancla específica para cada una
  const tpFilter = `
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = tp.user_id
              )`;

  // Buscar todas las líneas "AND pr.is_bot = false" y ver cada una
  const positions = [];
  let pos = 0;
  while (true) {
    const idx = src.indexOf('AND pr.is_bot = false', pos);
    if (idx === -1) break;
    positions.push(idx);
    pos = idx + 1;
  }
  console.log(`Ocurrencias de "AND pr.is_bot = false": ${positions.length}`);

  // Para cada ocurrencia, ver los 500 chars previos para detectar "planets tp"
  // e insertar al final de esa línea
  // IMPORTANTE: recorrer desde la última para no invalidar índices previos
  let inserted = 0;
  for (let i = positions.length - 1; i >= 0; i--) {
    const start = positions[i];
    const lineEnd = src.indexOf('\n', start);
    const context = src.slice(Math.max(0, start - 500), start);
    if (context.includes('planets tp')) {
      src = src.slice(0, lineEnd) + tpFilter + src.slice(lineEnd);
      inserted++;
    }
  }
  console.log(`✅ Filtro tp insertado en ${inserted} queries`);

  // Retaliación: buscar patrón br.attacker_id
  const retalAnchor = `AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = br.attacker_id AND pr.is_bot = false AND COALESCE(pr.vacation_mode, false) = false AND pr.is_admin = false)`;
  const retalFilter = `
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = br.attacker_id
              )`;
  if (src.includes(retalAnchor)) {
    src = src.replace(retalAnchor, retalAnchor + retalFilter);
    console.log('✅ Filtro de alianza en retaliación');
  } else {
    console.log('⚠️  Retaliación no encontrada');
  }

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

  const t = await client.query(`SELECT bot_ai_tick()`);
  console.log('\nTick de prueba:', JSON.stringify(t.rows[0].bot_ai_tick));

  await client.end();
}

main().catch(async e => { console.error('❌', e.message); try{await client.end();}catch{}; process.exit(1); });
