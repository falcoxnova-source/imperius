const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    SELECT tgname, tgenabled, tgtype
      FROM pg_trigger
     WHERE tgrelid = 'public.planet_buildings'::regclass
       AND tgname = 'trigger_enforce_lunar_base_fields_max'`);
  console.log('trigger in pg_trigger:', r.rows);

  // Simulate: upgrade a test moon's LB from current to +1 and see trigger fire
  // Pick a safe moon: take diablo moon 2 back to LB=3
  const before = await c.query(`
    SELECT fields_max, (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=15) AS lb
      FROM planets p WHERE id='13f7c222-9e97-48ea-9abf-0e56d1272214'`);
  console.log('before:', before.rows[0]);

  // Test: simulate upgrade LB to level 3 (trigger-only test, then revert)
  await c.query(`BEGIN`);
  await c.query(`UPDATE planet_buildings SET level = 3 WHERE planet_id='13f7c222-9e97-48ea-9abf-0e56d1272214' AND building_type_id=15`);
  const after = await c.query(`
    SELECT fields_max, (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=15) AS lb
      FROM planets p WHERE id='13f7c222-9e97-48ea-9abf-0e56d1272214'`);
  console.log('after sim UPDATE LB→3:', after.rows[0], '(expected fields_max >= 1+3*3=10)');
  await c.query(`ROLLBACK`);

  const reverted = await c.query(`
    SELECT fields_max, (SELECT level FROM planet_buildings WHERE planet_id=p.id AND building_type_id=15) AS lb
      FROM planets p WHERE id='13f7c222-9e97-48ea-9abf-0e56d1272214'`);
  console.log('after rollback:', reverted.rows[0]);

  await c.end();
})();
