// Script para borrar SOLO los NPCs creados por create-300-npcs.cjs
// Identificación segura: profiles.is_bot = true AND email LIKE '%@falcox.local'
// Los 20 bots antiguos NO tienen dominio @falcox.local, por lo tanto NO se tocan.
// Uso:
//   node scripts/delete-300-npcs.cjs           -> solo diagnóstico (no borra)
//   node scripts/delete-300-npcs.cjs --execute -> borra de verdad

const { Client } = require('pg');

const EXECUTE = process.argv.includes('--execute');

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
  console.log('='.repeat(70));
  console.log(EXECUTE ? '🔴 MODO EJECUCIÓN (SE BORRARÁN DATOS)' : '🟢 MODO DIAGNÓSTICO (solo lectura)');
  console.log('='.repeat(70));

  // 1. Diagnóstico: ¿cuántos NPCs nuevos?
  const newNpcs = await client.query(`
    SELECT id, username, email, points_total
    FROM profiles
    WHERE is_bot = true AND email LIKE '%@falcox.local'
    ORDER BY points_total DESC
  `);
  console.log(`\n📊 NPCs nuevos a borrar (is_bot=true AND email LIKE '%@falcox.local'): ${newNpcs.rowCount}`);
  if (newNpcs.rowCount > 0) {
    console.log('   Top 5:');
    newNpcs.rows.slice(0, 5).forEach(r => console.log(`     - ${r.username} (${r.points_total} pts) ${r.email}`));
    console.log('   Últimos 3:');
    newNpcs.rows.slice(-3).forEach(r => console.log(`     - ${r.username} (${r.points_total} pts) ${r.email}`));
  }

  // 2. Diagnóstico: ¿cuántos bots antiguos (NO se tocan)?
  const oldBots = await client.query(`
    SELECT id, username, email, points_total
    FROM profiles
    WHERE is_bot = true AND (email IS NULL OR email NOT LIKE '%@falcox.local')
    ORDER BY points_total DESC
  `);
  console.log(`\n🛡️  Bots antiguos PROTEGIDOS (NO se tocan): ${oldBots.rowCount}`);
  oldBots.rows.slice(0, 10).forEach(r => console.log(`     - ${r.username} (${r.points_total} pts) ${r.email || '(sin email)'}`));

  // 3. Diagnóstico: jugadores reales (NO se tocan)
  const realPlayers = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM profiles
    WHERE is_bot = false OR is_bot IS NULL
  `);
  console.log(`\n👥 Jugadores reales PROTEGIDOS (NO se tocan): ${realPlayers.rows[0].n}`);

  // Verificación de seguridad: ¿algún jugador real tiene @falcox.local?
  const sanity = await client.query(`
    SELECT COUNT(*)::int AS n
    FROM profiles
    WHERE (is_bot = false OR is_bot IS NULL) AND email LIKE '%@falcox.local'
  `);
  if (sanity.rows[0].n > 0) {
    console.log(`\n❌ ABORTANDO: se encontraron ${sanity.rows[0].n} jugadores reales con @falcox.local. No es seguro continuar.`);
    await client.end();
    process.exit(1);
  }
  console.log(`✅ Verificación de seguridad: 0 jugadores reales con @falcox.local (seguro proceder)`);

  if (newNpcs.rowCount === 0) {
    console.log('\n⚠️  No hay NPCs nuevos para borrar. Saliendo.');
    await client.end();
    return;
  }

  if (!EXECUTE) {
    console.log('\n' + '='.repeat(70));
    console.log(`MODO DIAGNÓSTICO. Para borrar ejecuta: node scripts/delete-300-npcs.cjs --execute`);
    console.log('='.repeat(70));
    await client.end();
    return;
  }

  // 4. BORRADO REAL en una sola transacción
  const ids = newNpcs.rows.map(r => r.id);
  console.log(`\n🗑️  Borrando ${ids.length} NPCs en transacción única...`);

  try {
    await client.query('BEGIN');
    // Deshabilitar triggers durante la transacción (evita recálculos de puntos, etc.)
    try {
      await client.query(`SET LOCAL session_replication_role = 'replica'`);
      console.log('   Triggers deshabilitados para esta transacción');
    } catch (e) {
      console.log('   ⚠️  No se pudieron deshabilitar triggers:', e.message);
    }

    // Obtener planet_ids de esos NPCs
    const planetsRes = await client.query(
      `SELECT id FROM planets WHERE user_id = ANY($1::uuid[])`,
      [ids]
    );
    const planetIds = planetsRes.rows.map(r => r.id);
    console.log(`   Planetas encontrados: ${planetIds.length}`);

    if (planetIds.length > 0) {
      const r1 = await client.query(`DELETE FROM planet_defenses WHERE planet_id = ANY($1::uuid[])`, [planetIds]);
      console.log(`   planet_defenses borradas: ${r1.rowCount}`);
      const r2 = await client.query(`DELETE FROM planet_ships WHERE planet_id = ANY($1::uuid[])`, [planetIds]);
      console.log(`   planet_ships borradas: ${r2.rowCount}`);
      const r3 = await client.query(`DELETE FROM planet_buildings WHERE planet_id = ANY($1::uuid[])`, [planetIds]);
      console.log(`   planet_buildings borradas: ${r3.rowCount}`);
      const r4 = await client.query(`DELETE FROM planet_resources WHERE planet_id = ANY($1::uuid[])`, [planetIds]);
      console.log(`   planet_resources borradas: ${r4.rowCount}`);
    }

    const r5 = await client.query(`DELETE FROM user_technologies WHERE user_id = ANY($1::uuid[])`, [ids]);
    console.log(`   user_technologies borradas: ${r5.rowCount}`);

    const r6 = await client.query(`DELETE FROM planets WHERE user_id = ANY($1::uuid[])`, [ids]);
    console.log(`   planets borrados: ${r6.rowCount}`);

    // Limpiar tablas secundarias que pudieron llenarse por triggers o logs
    const secondaryTables = [
      'points_update_queue',
      'research_queue',
      'fleets',
      'login_sessions',
      'messages',  // sender o recipient
    ];
    for (const tbl of ['points_update_queue','research_queue','fleets','login_sessions']) {
      try {
        const r = await client.query(`DELETE FROM ${tbl} WHERE user_id = ANY($1::uuid[])`, [ids]);
        if (r.rowCount > 0) console.log(`   ${tbl} borradas: ${r.rowCount}`);
      } catch (e) { console.log(`   (skip ${tbl}: ${e.message})`); }
    }
    try {
      const rm = await client.query(`DELETE FROM messages WHERE sender_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])`, [ids]);
      if (rm.rowCount > 0) console.log(`   messages borradas: ${rm.rowCount}`);
    } catch (e) { console.log(`   (skip messages: ${e.message})`); }

    const r7 = await client.query(`DELETE FROM profiles WHERE id = ANY($1::uuid[])`, [ids]);
    console.log(`   profiles borrados: ${r7.rowCount}`);

    const r8 = await client.query(`DELETE FROM auth.users WHERE id = ANY($1::uuid[])`, [ids]);
    console.log(`   auth.users borrados: ${r8.rowCount}`);

    await client.query('COMMIT');
    console.log(`\n✅ BORRADO COMPLETADO. ${ids.length} NPCs eliminados limpiamente.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR durante borrado. ROLLBACK aplicado. Nada se ha borrado.');
    console.error(err.message);
    process.exit(1);
  }

  // 5. Verificación final
  const after = await client.query(`
    SELECT COUNT(*)::int AS n FROM profiles
    WHERE is_bot = true AND email LIKE '%@falcox.local'
  `);
  console.log(`\n📊 Verificación final: NPCs @falcox.local restantes = ${after.rows[0].n} (debe ser 0)`);

  const botsLeft = await client.query(`SELECT COUNT(*)::int AS n FROM profiles WHERE is_bot = true`);
  console.log(`📊 Bots totales restantes: ${botsLeft.rows[0].n} (deberían ser los 20 antiguos)`);

  await client.end();
}

main().catch(async (e) => {
  console.error('Error fatal:', e.message);
  try { await client.end(); } catch {}
  process.exit(1);
});
