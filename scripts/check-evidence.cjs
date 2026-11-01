const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query('SELECT id, evidence FROM p2p_disputes');
  console.log('Evidence:', JSON.stringify(r.rows, null, 2));
  const b = await c.query("SELECT id, name, public FROM storage.buckets WHERE name ILIKE '%p2p%'");
  console.log('Buckets:', b.rows);
  const g = await c.query("SELECT key, value FROM game_settings WHERE key LIKE '%dispute%' OR key LIKE '%p2p%' LIMIT 20");
  console.log('Settings:', g.rows);
  await c.end();
})().catch(e=>console.error(e.message));
