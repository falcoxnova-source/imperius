const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  try {
    console.log('>>> BEGIN transacción');
    await c.query('BEGIN');
    // Desactivamos triggers de usuario en esta sesión para evitar que el CASCADE
    // intente re-enqueue en points_update_queue cuando el profile ya se va.
    await c.query(`SET LOCAL session_replication_role = 'replica'`);

    // Snapshot previo
    const before = await c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=true) bots,
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=false) humanos,
        (SELECT COUNT(*)::int FROM planets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)) planetas_bot,
        (SELECT COUNT(*)::int FROM fleets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)) flotas_bot
    `);
    console.log('Antes:', before.rows[0]);

    // Lock profiles de bots y humanos counters
    const humansBefore = before.rows[0].humanos;

    // DELETE bots (cascada se encarga del resto)
    const del = await c.query(`DELETE FROM profiles WHERE is_bot=true RETURNING id`);
    console.log(`✓ Borrados ${del.rowCount} bots (cascada elimina planetas, flotas, research, tecnologías, mensajes, etc.)`);

    // Verificación humanos intactos
    const after = await c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=true) bots,
        (SELECT COUNT(*)::int FROM profiles WHERE is_bot=false) humanos,
        (SELECT COUNT(*)::int FROM planets) planetas_total,
        (SELECT COUNT(*)::int FROM fleets) flotas_total,
        (SELECT COUNT(*)::int FROM profiles WHERE autopilot_active=true) autopilot_activos
    `);
    console.log('Después:', after.rows[0]);

    if (after.rows[0].humanos !== humansBefore) {
      throw new Error(`PELIGRO: count humanos cambió ${humansBefore} -> ${after.rows[0].humanos}. Rollback.`);
    }
    if (after.rows[0].bots !== 0) {
      throw new Error(`Aún quedan bots: ${after.rows[0].bots}. Rollback.`);
    }

    await c.query('COMMIT');
    console.log('>>> COMMIT. Humanos intactos. Autopilot activo en', after.rows[0].autopilot_activos, 'cuentas.');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK por error:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
