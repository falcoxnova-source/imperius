const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='update_planet_fields_on_terraformer'`);
  console.log('=== update_planet_fields_on_terraformer ===');
  if (r.rows[0]) console.log(r.rows[0].prosrc);
  else console.log('(not found)');

  // Also show protect_game_table_full
  const r2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='protect_game_table_full'`);
  console.log('\n=== protect_game_table_full ===');
  if (r2.rows[0]) console.log(r2.rows[0].prosrc);
  await c.end();
})();
