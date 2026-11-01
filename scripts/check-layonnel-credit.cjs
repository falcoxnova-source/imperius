const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();

  // Find user
  const user = await c.query(`SELECT id, username, fxu_balance, points_total FROM profiles WHERE username ILIKE '%layonnel%'`);
  if (!user.rows.length) { console.log('Usuario no encontrado'); await c.end(); return; }
  const u = user.rows[0];
  console.log(`Usuario: ${u.username}`);
  console.log(`Balance: ${parseFloat(u.fxu_balance).toFixed(2)} FXU | Puntos: ${u.points_total}\n`);

  // All spending that counts as credit (investment)
  console.log('=== INVERSIONES (generan crédito) ===');
  const credit = await c.query(`
    SELECT revenue_type, COUNT(*) as cnt, SUM(amount) as total
    FROM admin_revenue
    WHERE related_user_id = $1
      AND revenue_type IN ('plus_subscription','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
    GROUP BY revenue_type
    ORDER BY total DESC
  `, [u.id]);
  let totalCredit = 0;
  credit.rows.forEach(r => {
    const t = parseFloat(r.total);
    totalCredit += t;
    console.log(`  ${r.revenue_type}: ${r.cnt} ops → ${t.toFixed(0)} FXU`);
  });
  console.log(`  TOTAL INVERTIDO (crédito): ${totalCredit.toFixed(0)} FXU`);

  // Spending that does NOT count (fleet_acceleration)
  console.log('\n=== GASTOS SIN CRÉDITO ===');
  const noCredit = await c.query(`
    SELECT revenue_type, COUNT(*) as cnt, SUM(amount) as total
    FROM admin_revenue
    WHERE related_user_id = $1
      AND revenue_type IN ('fleet_acceleration','market_fee','swap_fee','transfer_fee','withdrawal_fee')
    GROUP BY revenue_type
    ORDER BY total DESC
  `, [u.id]);
  noCredit.rows.forEach(r => {
    console.log(`  ${r.revenue_type}: ${r.cnt} ops → ${parseFloat(r.total).toFixed(0)} FXU`);
  });

  // Detailed breakdown of credit-generating spending
  console.log('\n=== DETALLE DE INVERSIONES ===');
  const detail = await c.query(`
    SELECT revenue_type, amount, description, created_at
    FROM admin_revenue
    WHERE related_user_id = $1
      AND revenue_type IN ('plus_subscription','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
    ORDER BY created_at DESC
    LIMIT 30
  `, [u.id]);
  detail.rows.forEach(r => {
    console.log(`  ${r.revenue_type}: ${parseFloat(r.amount).toFixed(0)} FXU | ${r.description} | ${new Date(r.created_at).toLocaleDateString()}`);
  });

  // Running credit
  const creditRes = await c.query(`SELECT calculate_running_fxu_credit($1) as credit`, [u.id]);
  console.log(`\n=== CRÉDITO ACTUAL (running balance) ===`);
  console.log(`Crédito: ${parseFloat(creditRes.rows[0].credit).toFixed(0)} FXU`);

  // Sales from cutoff
  const sales = await c.query(`
    SELECT SUM(mt.total_price) as total_sold
    FROM market_transactions mt
    JOIN market_listings ml ON ml.id = mt.listing_id
    WHERE mt.seller_id = $1
      AND ml.listing_type IN ('resource','ship')
      AND mt.created_at >= '2026-03-29T00:00:00Z'
  `, [u.id]);
  console.log(`Vendido desde cutoff: ${parseFloat(sales.rows[0]?.total_sold || 0).toFixed(0)} FXU`);
  console.log(`Crédito restante = Invertido - Vendido (con floor en 0)`);

  await c.end();
})();
