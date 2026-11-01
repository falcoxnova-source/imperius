const { Client } = require('pg');
const cfg = { host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}};
(async () => {
  const c = new Client(cfg); await c.connect();
  const body = await c.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='protect_fxu_balance'
  `);
  console.log(body.rows[0]?.def);
  await c.end();
})();
