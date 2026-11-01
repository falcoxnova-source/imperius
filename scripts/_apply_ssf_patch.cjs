const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260424_secure_send_fleet_sync_before_read.sql','utf8');
  const r = await c.query(sql);
  console.log('migration applied');

  // verificar
  const v = await c.query(`SELECT pg_get_functiondef(oid) AS s FROM pg_proc WHERE proname='secure_send_fleet'`);
  const src = v.rows[0].s;
  console.log('contains PERFORM sync_planet_resources?', src.includes('PERFORM sync_planet_resources(p_origin_planet_id)'));
  console.log('contains FOR UPDATE?', /planet_resources WHERE planet_id = p_origin_planet_id FOR UPDATE/.test(src));
  console.log('contains PATCH 20260424?', src.includes('PATCH 20260424'));
  await c.end();
})();
