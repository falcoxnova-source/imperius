const { Client } = require('pg');
const cfg = { host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}};
(async () => {
  const c = new Client(cfg); await c.connect();
  const t = await c.query(`
    SELECT trigger_name, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_table='profiles'
  `);
  console.log('--- triggers on profiles ---');
  console.table(t.rows);

  // buscar funciones con FXU002 en su cuerpo
  const f = await c.query(`
    SELECT n.nspname, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE pg_get_functiondef(p.oid) ILIKE '%FXU002%'
    LIMIT 20
  `);
  console.log('--- funciones que mencionan FXU002 ---');
  console.table(f.rows);

  // Ver el trigger function
  const body = await c.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname ILIKE '%prevent%fxu%' OR p.proname ILIKE '%fxu%guard%' OR p.proname ILIKE '%balance%guard%'
  `);
  body.rows.forEach(r => { console.log('\n---\n', r.def); });

  await c.end();
})();
