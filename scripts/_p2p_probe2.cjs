const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r1=await c.query(`SELECT id,username,referred_by,fxu_balance::numeric(18,4) fxu,usdt_balance::numeric(18,4) usdt FROM profiles WHERE is_admin=false AND referred_by IS NOT NULL AND fxu_balance>=100 AND usdt_balance>=10 ORDER BY fxu_balance DESC LIMIT 8`);
  console.log('CON ref:');console.table(r1.rows);
  const r2=await c.query(`SELECT id,username,referred_by,fxu_balance::numeric(18,4) fxu,usdt_balance::numeric(18,4) usdt FROM profiles WHERE is_admin=false AND referred_by IS NULL AND fxu_balance>=100 AND usdt_balance>=10 ORDER BY fxu_balance DESC LIMIT 8`);
  console.log('SIN ref:');console.table(r2.rows);
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
