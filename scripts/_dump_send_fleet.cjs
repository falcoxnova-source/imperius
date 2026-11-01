const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Obtener la definición viva de la función
  const def = await c.query(`SELECT proname, pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname IN ('secure_send_fleet','send_fleet','send_fleet_secure') ORDER BY proname`);
  for (const r of def.rows) {
    console.log('\n=============== ' + r.proname + ' ===============');
    console.log(r.src);
  }
  await c.end();
})();
