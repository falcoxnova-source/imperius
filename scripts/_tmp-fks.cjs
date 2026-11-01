const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  // FKs apuntando a profiles.id o auth.users.id
  const r = await c.query(`
    SELECT
      tc.table_schema, tc.table_name, kcu.column_name,
      ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (
        (ccu.table_schema='public' AND ccu.table_name='profiles' AND ccu.column_name='id')
        OR (ccu.table_schema='auth' AND ccu.table_name='users' AND ccu.column_name='id')
      )
    ORDER BY tc.table_schema, tc.table_name
  `);
  console.log('Tablas con FK a profiles/auth.users:');
  r.rows.forEach(x => console.log(`  ${x.table_schema}.${x.table_name}.${x.column_name} -> ${x.ref_schema}.${x.ref_table}.${x.ref_column}`));
  await c.end();
})();
