const {Client}=require('pg');const fs=require('fs');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r=await c.query("SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'");
  fs.writeFileSync('scripts/_bot_ai_tick_current.sql',r.rows[0].prosrc);
  console.log('Lines:',r.rows[0].prosrc.split('\n').length);
  await c.end();
});
