const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='p2p_disputes' ORDER BY ordinal_position");
  console.log('Columnas p2p_disputes:', cols.rows.map(r=>r.column_name).join(', '));

  const r = await c.query("SELECT id, order_id, status, opened_by, opened_at, LEFT(reason,80) AS reason FROM p2p_disputes ORDER BY opened_at DESC LIMIT 20");
  console.log('\nDisputas (' + r.rows.length + '):');
  console.table(r.rows);

  // Test the function as if called by admin
  const adminId = 'fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6';
  await c.query(`SET LOCAL ROLE authenticated`);
  await c.query(`SET LOCAL "request.jwt.claims" = '${JSON.stringify({sub: adminId, role: 'authenticated'})}'`);
  try {
    const fn = await c.query("SELECT * FROM p2p_admin_list_disputes(NULL)");
    console.log('\np2p_admin_list_disputes(NULL) returned ' + fn.rows.length + ' rows');
    console.log(JSON.stringify(fn.rows.slice(0,3), null, 2));
  } catch(e) {
    console.log('Error calling fn:', e.message);
  }
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1);});
