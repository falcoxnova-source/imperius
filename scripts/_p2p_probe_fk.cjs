const { Client } = require('pg');
const cfg = { host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}};
(async()=>{
  const c=new Client(cfg); await c.connect();
  const r = await c.query(`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='referral_commissions'::regclass`);
  console.table(r.rows);
  await c.end();
})();
