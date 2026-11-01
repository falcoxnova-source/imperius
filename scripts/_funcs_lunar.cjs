const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Find all functions that reference building_queue completion or insert into planet_buildings with building_type_id = 15 / lunar_base
  const r = await c.query(`
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND (p.prosrc ILIKE '%lunar_base%' OR p.prosrc ILIKE '%building_type_id = 15%' OR p.prosrc ILIKE '%fields_max%')
    ORDER BY p.proname`);
  console.log('Functions referencing lunar_base/fields_max:');
  for (const row of r.rows) console.log('  -', row.proname);

  await c.end();
})();
