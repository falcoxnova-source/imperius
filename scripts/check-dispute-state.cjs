const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();

  console.log('=== Todas las disputas ===');
  const d = await c.query("SELECT d.id, d.order_id, d.status, d.opened_by, d.opened_at, d.resolved_at, o.status AS order_status, o.asset_amount, o.fiat_amount FROM p2p_disputes d JOIN p2p_orders o ON o.id=d.order_id ORDER BY d.opened_at DESC");
  console.table(d.rows);

  console.log('\n=== Ordenes en disputed o paid recientes ===');
  const o = await c.query("SELECT id, seller_id, buyer_id, status, asset_amount, fiat_amount, paid_at, payment_deadline, created_at FROM p2p_orders WHERE status IN ('paid','disputed','pending_payment') ORDER BY created_at DESC LIMIT 20");
  console.table(o.rows.map(r=>({...r, created_at: r.created_at?.toISOString(), paid_at: r.paid_at?.toISOString(), payment_deadline: r.payment_deadline?.toISOString()})));

  console.log('\n=== Audit log de dispute_opened (últimos 30) ===');
  const a = await c.query("SELECT order_id, actor_id, action, created_at, meta FROM p2p_audit_log WHERE action LIKE '%dispute%' ORDER BY created_at DESC LIMIT 30");
  console.table(a.rows.map(r=>({...r, created_at: r.created_at?.toISOString()})));

  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
