const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  
  // 1. Ver raw data de Nueva Terra
  const r = await client.query(`
    SELECT pr.*
    FROM planet_resources pr
    JOIN planets p ON p.id = pr.planet_id
    WHERE p.name = 'Nueva Terra'
  `);
  console.log('Nueva Terra planet_resources:', r.rows);
  
  // 2. Error JSON "Tus" - buscar en logs recientes
  const errs = await client.query(`
    SELECT start_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = 23 AND status='failed'
    ORDER BY start_time DESC LIMIT 3
  `);
  console.log('\n=== Errores recientes del bot ===');
  errs.rows.forEach(e => console.log(`\n[${e.start_time}]\n${e.return_message}`));
  
  await client.end();
})();
