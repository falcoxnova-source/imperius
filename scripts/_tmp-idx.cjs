const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='profiles' AND schemaname='public'");
  r.rows.forEach(x => console.log(x.indexname, '=>', x.indexdef));
  await c.end();
})();
