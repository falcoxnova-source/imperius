const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  console.log('=== Lunas recientes: fields_max vs esperado ===');
  const r = await c.query(`
    SELECT p.id, p.name, p.user_id, pr.username,
           p.fields_used, p.fields_max,
           COALESCE(pb.level, 0) AS lb_level,
           (1 + COALESCE(pb.level,0) * 3) AS expected_fields,
           p.fields_max - (1 + COALESCE(pb.level,0) * 3) AS diff
    FROM planets p
    LEFT JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN planet_buildings pb
      ON pb.planet_id = p.id
     AND pb.building_type_id = (SELECT id FROM building_types WHERE code='lunar_base')
    WHERE p.planet_type = 'moon'
    ORDER BY pr.created_at DESC NULLS LAST, p.id DESC
    LIMIT 40;
  `);
  console.table(r.rows);

  console.log('\n=== Cola de construcción activa en lunas con lunar_base ===');
  const q = await c.query(`
    SELECT bq.id, bq.planet_id, p.name AS moon, bt.code AS building, bq.target_level, bq.status, bq.ends_at
    FROM build_queue bq
    JOIN planets p ON p.id = bq.planet_id
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE p.planet_type = 'moon' AND bt.code = 'lunar_base'
    ORDER BY bq.created_at DESC
    LIMIT 20;
  `).catch(e => ({ error: e.message, rows: [] }));
  if (q.error) console.log('No build_queue table / col mismatch:', q.error);
  else console.table(q.rows);

  console.log('\n=== ¿Está la función con la fórmula correcta? ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='optimized_global_queue_processor'`);
  if (fn.rows.length === 0) console.log('NO EXISTE');
  else {
    const src = fn.rows[0].prosrc;
    console.log('Usa 1 + (... * 3)      :', /1\s*\+\s*\(\s*v_queue_item\.target_level\s*\*\s*3\s*\)/.test(src));
    console.log('Sigue con FLOOR/diameter:', /FLOOR\s*\(\s*diameter/i.test(src));
    // Buscar bloque que actualiza fields_max con lunar_base
    const idx = src.indexOf('fields_max');
    if (idx >= 0) console.log('\nContexto fields_max:\n', src.substring(Math.max(0,idx-200), idx+400));
  }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
