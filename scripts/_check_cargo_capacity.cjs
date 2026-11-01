const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query(`SELECT id, code, name, cargo_capacity FROM ship_types WHERE code IN ('small_cargo','large_cargo')`);
  console.table(r.rows);

  // Ver cómo calcula capacidad secure_send_fleet. Buscar uso de cargo_capacity y tech hyperspace
  const src = await c.query(`SELECT substring(prosrc FROM position('cargo_capacity' IN prosrc) FOR 2000) AS s FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='secure_send_fleet' AND n.nspname='public'`);
  console.log('secure_send_fleet cargo check:');
  console.log(src.rows[0]?.s || '(not found)');

  await c.end();
})();
