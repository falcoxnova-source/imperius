const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // Ver si secure_send_fleet llama a sync_planet_resources internamente
  const q = await c.query(`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='secure_send_fleet'`);
  const src = q.rows[0].src;
  console.log('calls sync_planet_resources inside?', /sync_planet_resources|update_planet_production|sync_resources/i.test(src));
  console.log('calls PERFORM/SELECT before reading resources?');
  const idx = src.indexOf('FROM planet_resources');
  console.log(src.substring(Math.max(0, idx - 400), idx + 200));

  // Ver saldo actual planet_resources del user admin (falcoxcorp) como prueba: diferencia con "last_update"
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planet_resources' ORDER BY column_name`);
  console.log('\nplanet_resources cols:', cols.rows.map(r=>r.column_name).join(', '));

  // user admin
  const ur = await c.query(`SELECT p.id, p.name, pr.metal, pr.crystal, pr.deuterium, pr.last_update, now() - pr.last_update AS stale_for, pl.metal_production_rate, pl.crystal_production_rate
                              FROM planets p
                              JOIN planet_resources pr ON pr.planet_id=p.id
                              LEFT JOIN (SELECT pr2.planet_id,
                                    NULL::numeric AS metal_production_rate, NULL::numeric AS crystal_production_rate
                                   FROM planet_resources pr2) pl ON pl.planet_id=p.id
                              WHERE p.user_id=(SELECT id FROM profiles WHERE email='falcoxcorp@gmail.com')
                              ORDER BY p.name LIMIT 5`);
  for (const r of ur.rows) console.log(r);
  await c.end();
})();
