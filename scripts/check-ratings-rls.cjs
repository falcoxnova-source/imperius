const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r=await c.query("SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename='p2p_ratings'");
  console.log(JSON.stringify(r.rows,null,2));
  console.log('---');
  // Simulate as anon role
  await c.query("SET ROLE anon");
  const a=await c.query("SELECT count(*) FROM p2p_ratings WHERE ratee_id='fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'");
  console.log('Anon count for admin:', a.rows[0].count);
  await c.query("RESET ROLE");
  await c.query("SET ROLE authenticated");
  const au=await c.query("SELECT count(*) FROM p2p_ratings WHERE ratee_id='fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6'");
  console.log('Authenticated count for admin:', au.rows[0].count);
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1);});
