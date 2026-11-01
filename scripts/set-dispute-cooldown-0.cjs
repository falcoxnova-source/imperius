const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  await c.query("UPDATE game_settings SET value='0' WHERE key='p2p_dispute_cooldown_minutes'");
  const r = await c.query("SELECT key, value FROM game_settings WHERE key='p2p_dispute_cooldown_minutes'");
  console.log('OK:', r.rows);
  await c.end();
})().catch(e=>console.error(e.message));
