// Versión 2: filtro de alianza con alias correcto por query
// Las 3 primeras queries usan tp.user_id, la 4ª (retaliación) usa br.attacker_id

const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

function allyFilter(targetCol) {
  return `
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = ${targetCol}
              )`;
}

async function main() {
  await client.connect();

  // Primero DESHACER el parche anterior (que dejó 4 bloques mal) — recrear función limpia
  // Obtengo el bot_ai_tick actual y quito cualquier bloque "alliance_members am_self" ya insertado
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  let src = fn.rows[0].prosrc;

  // Limpiar filtros previos
  src = src.replace(/\s+AND NOT EXISTS \(\s+SELECT 1 FROM alliance_members am_self[\s\S]*?\)\s*\)/g, '');
  console.log('🧹 Filtros previos limpiados');

  // Insertar los nuevos filtros en cada query usando su alias correcto
  // Query 1: línea ~797 (spy generic) - usa tp
  // Query 2: línea ~903 (attack by spy report) - usa tp
  // Query 3: línea ~1072 (attack by points) - usa tp
  // Query 4: retaliación - usa br.attacker_id

  // Las 3 primeras: después de "AND pr.is_bot = false" cuando el bloque FROM use "planets tp"
  const lines = src.split('\n');
  let tpInserts = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('AND pr.is_bot = false')) {
      // Ver el contexto reciente para determinar alias
      const context = lines.slice(Math.max(0, i-15), i).join('\n');
      if (context.includes('planets tp')) {
        lines.splice(i + 1, 0, allyFilter('tp.user_id'));
        tpInserts++;
        i += 7;
      }
    }
  }
  src = lines.join('\n');
  console.log(`✅ Filtro tp.user_id insertado en ${tpInserts} queries`);

  // Query 4: retaliación — dentro del EXISTS con "br.attacker_id"
  const oldRetal = `AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = br.attacker_id AND pr.is_bot = false AND COALESCE(pr.vacation_mode, false) = false AND pr.is_admin = false)`;
  const newRetal = `AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = br.attacker_id AND pr.is_bot = false AND COALESCE(pr.vacation_mode, false) = false AND pr.is_admin = false)
              AND NOT EXISTS (
                SELECT 1 FROM alliance_members am_self
                JOIN alliance_members am_tgt ON am_tgt.alliance_id = am_self.alliance_id
                WHERE am_self.user_id = v_bot.id
                  AND am_tgt.user_id = br.attacker_id
              )`;
  if (src.includes(oldRetal)) {
    src = src.replace(oldRetal, newRetal);
    console.log('✅ Filtro de alianza añadido a retaliaciones');
  } else {
    console.log('⚠️  Retaliación: patrón no encontrado');
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
