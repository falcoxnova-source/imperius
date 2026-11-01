const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r = await c.query("SELECT prorettype::regtype, proargnames, proargtypes FROM pg_proc WHERE proname='bot_ai_tick'");
  console.log(r.rows);
  await c.end();
});
