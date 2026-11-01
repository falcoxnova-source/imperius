const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();

  // All users who have invested in the company
  const {rows} = await c.query(`
    SELECT 
      p.username,
      p.points_total,
      get_user_lifetime_fxu_spent(p.id) as fxu_spent,
      get_user_market_earnings(p.id) as fxu_earned,
      calculate_running_fxu_credit(p.id) as fxu_credit,
      calculate_fxu_weekly_limit(p.id) as fxu_limit
    FROM profiles p
    WHERE get_user_lifetime_fxu_spent(p.id) > 0
    ORDER BY get_user_lifetime_fxu_spent(p.id) DESC
  `);

  console.log('=== TODOS LOS QUE HAN INVERTIDO EN LA EMPRESA ===\n');
  console.log('Usuario'.padEnd(30) + 'Gastado'.padStart(12) + 'Recuperado'.padStart(12) + 'Credito'.padStart(12) + '  Estado');
  console.log('-'.repeat(80));

  for(const r of rows){
    const spent = Number(r.fxu_spent);
    const earned = Number(r.fxu_earned);
    const credit = Number(r.fxu_credit);
    let estado = '';
    if (credit <= 0 && earned >= spent) {
      estado = '✅ YA RECUPERO TODO';
    } else if (credit <= 0 && earned < spent) {
      estado = '⚠️ CREDITO 0 pero NO recupero todo';
    } else {
      estado = '🔵 Pendiente recuperar ' + credit.toLocaleString();
    }

    console.log(
      r.username.substring(0,29).padEnd(30) + 
      spent.toLocaleString().padStart(12) + 
      earned.toLocaleString().padStart(12) + 
      credit.toLocaleString().padStart(12) + 
      '  ' + estado
    );
  }

  // Check MAIKOL specifically - breakdown of events
  console.log('\n\n=== DETALLE MAIKOL ===');
  const maikol = await c.query(`
    SELECT id FROM profiles WHERE username ILIKE '%MAIKOL%' LIMIT 1
  `);
  
  if (maikol.rows.length > 0) {
    const uid = maikol.rows[0].id;
    
    // Spending events
    const spending = await c.query(`
      SELECT revenue_type, amount, created_at 
      FROM admin_revenue 
      WHERE related_user_id = $1 
        AND revenue_type IN ('plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
        AND created_at >= '2026-03-29T00:00:00Z'
      ORDER BY created_at
    `, [uid]);
    
    console.log('\nGastos empresa (desde cutoff):');
    if (spending.rows.length === 0) {
      console.log('  (ninguno despues del cutoff 2026-03-29)');
    }
    for (const s of spending.rows) {
      console.log('  ' + s.revenue_type + ': ' + Number(s.amount).toLocaleString() + ' FXU (' + s.created_at + ')');
    }

    // Check if spending exists before cutoff
    const spendingBefore = await c.query(`
      SELECT revenue_type, SUM(amount) as total, COUNT(*) as cnt
      FROM admin_revenue 
      WHERE related_user_id = $1 
        AND revenue_type IN ('plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
        AND created_at < '2026-03-29T00:00:00Z'
      GROUP BY revenue_type
      ORDER BY total DESC
    `, [uid]);
    
    console.log('\nGastos empresa ANTES del cutoff (NO cuentan):');
    if (spendingBefore.rows.length === 0) {
      console.log('  (ninguno)');
    }
    for (const s of spendingBefore.rows) {
      console.log('  ' + s.revenue_type + ': ' + Number(s.total).toLocaleString() + ' FXU (' + s.cnt + ' transacciones)');
    }

    // Market earnings
    const earnings = await c.query(`
      SELECT SUM(mt.total_price) as total, COUNT(*) as cnt
      FROM market_transactions mt
      JOIN market_listings ml ON ml.id = mt.listing_id
      WHERE mt.seller_id = $1
        AND ml.listing_type IN ('resource','ship')
        AND mt.created_at >= '2026-03-29T00:00:00Z'
    `, [uid]);
    
    console.log('\nVentas mercado (desde cutoff):');
    console.log('  Total: ' + Number(earnings.rows[0].total || 0).toLocaleString() + ' FXU (' + earnings.rows[0].cnt + ' ventas)');
  }

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
