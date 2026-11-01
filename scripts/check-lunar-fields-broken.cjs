const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();

  // 1) Moons with fields_max < expected (1 + lb_level * 3)
  const broken = await c.query(`
    SELECT p.id, p.name, pr.username,
           p.fields_used, p.fields_max,
           COALESCE(pb.level, 0) AS lb_level,
           (1 + COALESCE(pb.level,0)*3) AS expected,
           (1 + COALESCE(pb.level,0)*3) - p.fields_max AS missing
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_buildings pb
      ON pb.planet_id = p.id
     AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
    WHERE p.planet_type='moon'
      AND p.fields_max < (1 + COALESCE(pb.level,0)*3)
    ORDER BY (1 + COALESCE(pb.level,0)*3) - p.fields_max DESC
    LIMIT 100;
  `);
  console.log('=== Lunas con fields_max MENOR al esperado ===');
  console.log('Total:', broken.rowCount);
  console.table(broken.rows);

  // 2) Moons where fields_max > expected (too many) - might indicate diameter-based bug
  const tooMany = await c.query(`
    SELECT p.id, p.name, pr.username,
           p.diameter, p.fields_used, p.fields_max,
           COALESCE(pb.level, 0) AS lb_level,
           (1 + COALESCE(pb.level,0)*3) AS expected,
           p.fields_max - (1 + COALESCE(pb.level,0)*3) AS extra
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_buildings pb
      ON pb.planet_id = p.id
     AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
    WHERE p.planet_type='moon'
      AND p.fields_max > (1 + COALESCE(pb.level,0)*3)
    ORDER BY (p.fields_max - (1 + COALESCE(pb.level,0)*3)) DESC
    LIMIT 30;
  `);
  console.log('\n=== Lunas con fields_max MAYOR al esperado ===');
  console.log('Total:', tooMany.rowCount);
  console.table(tooMany.rows);

  // 3) Summary count
  const sum = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE p.planet_type='moon') AS total_moons,
      COUNT(*) FILTER (WHERE p.planet_type='moon' AND p.fields_max < (1 + COALESCE(pb.level,0)*3)) AS broken,
      COUNT(*) FILTER (WHERE p.planet_type='moon' AND p.fields_max > (1 + COALESCE(pb.level,0)*3)) AS too_many,
      COUNT(*) FILTER (WHERE p.planet_type='moon' AND p.fields_max = (1 + COALESCE(pb.level,0)*3)) AS exact
    FROM planets p
    LEFT JOIN planet_buildings pb
      ON pb.planet_id = p.id
     AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
  `);
  console.log('\n=== Resumen ===');
  console.table(sum.rows);

  // 4) Search for ALL functions that update moon fields_max
  const fns = await c.query(`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ILIKE '%fields_max%'
      AND pg_get_functiondef(p.oid) ILIKE '%moon%'
    ORDER BY p.proname;
  `);
  console.log('\n=== Funciones que tocan fields_max + moon ===');
  console.table(fns.rows);

  // 5) Check ALL queue-processing functions
  const queueFns = await c.query(`
    SELECT p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname ILIKE '%queue%' OR p.proname ILIKE '%build%complete%' OR p.proname ILIKE '%process%build%')
    ORDER BY p.proname;
  `);
  console.log('\n=== Funciones queue/build-complete ===');
  console.table(queueFns.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
