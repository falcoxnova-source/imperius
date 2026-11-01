const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const src = (await c.query(`SELECT pg_get_functiondef(oid) AS s FROM pg_proc WHERE proname='secure_send_fleet'`)).rows[0].s;
  require('fs').writeFileSync('scripts/_secure_send_fleet_dump.sql', src);
  console.log('dumped to scripts/_secure_send_fleet_dump.sql, bytes=', src.length);

  // ¿Existe sync_planet_resources?
  const has = await c.query(`SELECT proname, pg_get_function_arguments(oid) AS args FROM pg_proc WHERE proname='sync_planet_resources'`);
  console.log('sync_planet_resources sigs:', has.rows);
  await c.end();
})();
