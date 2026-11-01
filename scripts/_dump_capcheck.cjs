const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query(`
    SELECT substring(prosrc FROM GREATEST(1, position('exceeds fleet capacity' IN prosrc) - 1200) FOR 1800) AS s
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='secure_send_fleet' AND n.nspname='public'
  `);
  console.log(r.rows[0]?.s);
  await c.end();
})();
