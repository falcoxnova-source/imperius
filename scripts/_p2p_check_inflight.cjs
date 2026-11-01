const {Client}=require('pg');
const c=new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query(`
    SELECT o.id, o.status, o.asset, o.asset_amount, o.fiat_currency, o.fiat_amount, f.side, o.created_at
    FROM p2p_orders o JOIN p2p_offers f ON f.id=o.offer_id
    WHERE o.status IN ('pending_payment','paid','disputed')
    ORDER BY o.created_at DESC`);
  console.table(r.rows);
  const r2 = await c.query(`SELECT id, side, status, available_amount, locked_amount FROM p2p_offers WHERE status='active' ORDER BY created_at DESC`);
  console.log('\nOfertas active:'); console.table(r2.rows);
  await c.end();
})();
