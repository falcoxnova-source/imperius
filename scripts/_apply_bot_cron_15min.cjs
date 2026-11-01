const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Reagendar job 23 (bot_ai_tick) a cada 15 min
  await c.query(`SELECT cron.alter_job(23, schedule := '*/15 * * * *')`);
  console.log('✓ cron bot_ai_tick reagendado a */15 * * * *');

  const j = await c.query(`SELECT jobid, schedule, command, active FROM cron.job WHERE jobid=23`);
  console.log('Verificación:', j.rows[0]);

  await c.end();
})();
