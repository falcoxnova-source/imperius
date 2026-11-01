const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query(`SELECT pg_get_function_result(oid) AS sig FROM pg_proc WHERE proname='p2p_admin_list_disputes'`);
  console.log(r.rows[0].sig);
  await c.end();
})().catch(e=>console.error(e.message));
