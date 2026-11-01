const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*'
});

c.connect().then(async () => {
  // Find resource tables
  const r = await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE column_name LIKE '%deuterium%' OR column_name LIKE '%resource_metal%' ORDER BY table_name`);
  console.log('=== Tables with resource columns ===');
  r.rows.forEach(x => console.log(x.table_name + '.' + x.column_name));
  
  // Check planet_resources table
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%resource%'`);
  console.log('\n=== Resource tables ===');
  tables.rows.forEach(x => console.log(x.table_name));
  
  // Check if resources are in planet_resources
  const pr = await c.query(`SELECT * FROM planet_resources WHERE planet_id = 'd89b8446-9d73-47d5-ae7f-2d19caa2ad9c'`);
  console.log('\n=== Moon resources ===');
  console.log(JSON.stringify(pr.rows, null, 2));

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
