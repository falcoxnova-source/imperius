const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1. Cron sigue programado para autopilot
  const cron = await c.query(`SELECT jobid, schedule, command, active FROM cron.job WHERE jobid=23`);
  console.log('Cron autopilot/tick:', cron.rows[0]);

  // 2. Autopilot humanos
  const ap = await c.query(`SELECT id, username, autopilot_active FROM profiles WHERE autopilot_active=true`);
  console.log('\nAutopilot activo en:');
  ap.rows.forEach(r=>console.log(`  ${r.username}`));

  // 3. Comprobar que no haya orphans (battle_reports con NULL correcto)
  const orph = await c.query(`
    SELECT
      (SELECT COUNT(*)::int FROM battle_reports WHERE attacker_id IS NULL OR defender_id IS NULL) br_null,
      (SELECT COUNT(*)::int FROM profiles WHERE is_bot=true) bots_restantes,
      (SELECT COUNT(*)::int FROM planets WHERE user_id NOT IN (SELECT id FROM profiles)) planetas_huerfanos,
      (SELECT COUNT(*)::int FROM fleets WHERE user_id NOT IN (SELECT id FROM profiles)) flotas_huerfanas
  `);
  console.log('\nSanidad:', orph.rows[0]);

  await c.end();
})();
