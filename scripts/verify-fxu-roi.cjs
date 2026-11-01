const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('='.repeat(80));
  console.log('VERIFICACIÓN COMPLETA: Sistema de ROI de FXU');
  console.log('='.repeat(80));

  // 1. Check cutoff date
  const { rows: [limits] } = await client.query(`
    SELECT earnings_cutoff_date, min_price_metal, min_price_crystal, min_price_deuterium,
           monthly_limit_enabled
    FROM market_resource_limits WHERE id = 1
  `);
  console.log('\n📋 CONFIGURACIÓN ACTUAL:');
  console.log(`   Cutoff date: ${limits.earnings_cutoff_date}`);
  console.log(`   Min prices: Metal=${limits.min_price_metal}, Crystal=${limits.min_price_crystal}, Deut=${limits.min_price_deuterium}`);
  console.log(`   Limits enabled: ${limits.monthly_limit_enabled}`);

  // 2. Check the spending function - what types count
  const { rows: funcDef } = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_user_lifetime_fxu_spent'
  `);
  const funcBody = funcDef[0].prosrc;
  console.log('\n📊 FUNCIÓN get_user_lifetime_fxu_spent:');
  
  const typesMatch = funcBody.match(/revenue_type IN \(([\s\S]*?)\)/);
  if (typesMatch) {
    const types = typesMatch[1].replace(/'/g, '').split(',').map(t => t.trim());
    console.log('   Tipos que CUENTAN como inversión:');
    types.forEach(t => console.log(`   ✅ ${t}`));
  }
  
  const hasCutoff = funcBody.includes('earnings_cutoff_date');
  console.log(`   Usa cutoff: ${hasCutoff ? '✅ Sí' : '❌ No'}`);

  // 3. Check the earnings function
  const { rows: earnDef } = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'get_user_market_earnings'
  `);
  const earnBody = earnDef[0].prosrc;
  const earnHasCutoff = earnBody.includes('earnings_cutoff_date');
  console.log('\n📊 FUNCIÓN get_user_market_earnings:');
  console.log(`   Usa cutoff: ${earnHasCutoff ? '✅ Sí' : '❌ No'}`);

  // 4. Check FXU limit formula
  const { rows: limitDef } = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'calculate_fxu_weekly_limit'
  `);
  const limitBody = limitDef[0].prosrc;
  console.log('\n📊 FUNCIÓN calculate_fxu_weekly_limit:');
  console.log(`   Usa get_user_lifetime_fxu_spent: ${limitBody.includes('get_user_lifetime_fxu_spent') ? '✅' : '❌'}`);
  console.log(`   Usa get_user_market_earnings: ${limitBody.includes('get_user_market_earnings') ? '✅' : '❌'}`);
  console.log(`   Fórmula: points × min_price + MAX(0, spent - earned)`);

  // 5. TEST CASES - Real players
  console.log('\n' + '='.repeat(80));
  console.log('🧪 CASOS DE PRUEBA CON JUGADORES REALES');
  console.log('='.repeat(80));

  // Get top spenders
  const { rows: topSpenders } = await client.query(`
    SELECT 
      ar.related_user_id,
      p.username,
      p.points_total,
      COALESCE(SUM(ar.amount), 0) as total_spent_after_cutoff
    FROM admin_revenue ar
    JOIN profiles p ON p.id = ar.related_user_id
    WHERE ar.revenue_type IN (
      'plus_subscription', 'fleet_acceleration', 'officer_fxu',
      'instant_ship', 'instant_build', 'instant_research', 'supply_box'
    )
    AND ar.created_at >= '2026-03-29T00:00:00Z'
    GROUP BY ar.related_user_id, p.username, p.points_total
    ORDER BY total_spent_after_cutoff DESC
    LIMIT 10
  `);

  for (const player of topSpenders) {
    const { rows: [spentRow] } = await client.query(
      `SELECT get_user_lifetime_fxu_spent($1) as spent`, [player.related_user_id]
    );
    const { rows: [earnedRow] } = await client.query(
      `SELECT get_user_market_earnings($1) as earned`, [player.related_user_id]
    );
    const { rows: [limitRow] } = await client.query(
      `SELECT calculate_fxu_weekly_limit($1) as fxu_limit`, [player.related_user_id]
    );

    const spent = parseFloat(spentRow.spent);
    const earned = parseFloat(earnedRow.earned);
    const credit = Math.max(0, spent - earned);
    const pointsFxu = player.points_total * 0.001;
    const fxuLimit = parseFloat(limitRow.fxu_limit);

    console.log(`\n👤 ${player.username} (${player.points_total} pts)`);
    console.log(`   💰 Gastado (empresa): ${spent.toLocaleString()} FXU`);
    console.log(`   📈 Ganado (mercado):  ${earned.toLocaleString()} FXU`);
    console.log(`   🎯 Crédito ROI:      MAX(0, ${spent.toLocaleString()} - ${earned.toLocaleString()}) = ${credit.toLocaleString()} FXU`);
    console.log(`   📊 Puntos como FXU:  ${player.points_total} × 0.001 = ${pointsFxu.toFixed(2)} FXU`);
    console.log(`   🏦 Límite FXU total: ${pointsFxu.toFixed(2)} + ${credit.toLocaleString()} = ${fxuLimit.toLocaleString()} FXU`);
    
    if (spent > 0) {
      const recoveryPct = Math.min(100, ((fxuLimit / spent) * 100)).toFixed(1);
      console.log(`   ♻️  Puede recuperar:  ${recoveryPct}% de su inversión`);
    }
  }

  // 6. Specific test: Luciffer Walker
  console.log('\n' + '='.repeat(80));
  console.log('🔍 CASO ESPECÍFICO: Luciffer Walker (100K Plus)');
  console.log('='.repeat(80));

  const { rows: [luciffer] } = await client.query(`
    SELECT id, username, points_total FROM profiles WHERE username ILIKE '%luciffer%'
  `);

  if (luciffer) {
    const { rows: [spentRow] } = await client.query(
      `SELECT get_user_lifetime_fxu_spent($1) as spent`, [luciffer.id]
    );
    const { rows: [earnedRow] } = await client.query(
      `SELECT get_user_market_earnings($1) as earned`, [luciffer.id]
    );
    const { rows: [limitRow] } = await client.query(
      `SELECT calculate_fxu_weekly_limit($1) as fxu_limit`, [luciffer.id]
    );

    // Detail of spending by type
    const { rows: spendingDetail } = await client.query(`
      SELECT revenue_type, COALESCE(SUM(amount), 0) as total
      FROM admin_revenue
      WHERE related_user_id = $1
        AND revenue_type IN (
          'plus_subscription', 'fleet_acceleration', 'officer_fxu',
          'instant_ship', 'instant_build', 'instant_research', 'supply_box'
        )
        AND created_at >= '2026-03-29T00:00:00Z'
      GROUP BY revenue_type
      ORDER BY total DESC
    `, [luciffer.id]);

    const spent = parseFloat(spentRow.spent);
    const earned = parseFloat(earnedRow.earned);
    const credit = Math.max(0, spent - earned);
    const pointsFxu = luciffer.points_total * 0.001;
    const fxuLimit = parseFloat(limitRow.fxu_limit);

    console.log(`\n   Puntos: ${luciffer.points_total}`);
    console.log(`   Detalle de gasto (empresa, después de cutoff):`);
    spendingDetail.forEach(r => {
      console.log(`      ${r.revenue_type}: ${parseFloat(r.total).toLocaleString()} FXU`);
    });
    console.log(`\n   💰 Total gastado:     ${spent.toLocaleString()} FXU`);
    console.log(`   📈 Total ganado:      ${earned.toLocaleString()} FXU`);
    console.log(`   🎯 Crédito ROI:       ${credit.toLocaleString()} FXU`);
    console.log(`   📊 Puntos × 0.001:   ${pointsFxu.toFixed(2)} FXU`);
    console.log(`   🏦 Límite semanal:    ${fxuLimit.toLocaleString()} FXU`);

    console.log(`\n   ✅ ¿Puede recuperar sus 100K? ${fxuLimit >= 100000 ? 'SÍ' : 'NO (necesita vender más semanas)'}`);
    console.log(`   ✅ Crédito = MAX(0, gastado - ganado) = MAX(0, ${spent.toLocaleString()} - ${earned.toLocaleString()}) = ${credit.toLocaleString()}`);
    
    // Check active listings
    const { rows: [activeLists] } = await client.query(`
      SELECT COUNT(*) as count, COALESCE(SUM(quantity * price_per_unit), 0) as fxu_value
      FROM market_listings
      WHERE seller_id = $1 AND status = 'active'
    `, [luciffer.id]);
    
    console.log(`\n   📋 Listings activos: ${activeLists.count} (valor: ${parseFloat(activeLists.fxu_value).toLocaleString()} FXU)`);
  }

  // 7. SCENARIO SIMULATION
  console.log('\n' + '='.repeat(80));
  console.log('🎮 SIMULACIÓN DE ESCENARIOS');
  console.log('='.repeat(80));

  const scenarios = [
    { name: 'Jugador invierte 100K FXU, no ha vendido nada', spent: 100000, earned: 0, points: 1000 },
    { name: 'Jugador invierte 100K FXU, ya vendió 50K', spent: 100000, earned: 50000, points: 1000 },
    { name: 'Jugador invierte 100K FXU, ya vendió 100K (ROI completo)', spent: 100000, earned: 100000, points: 1000 },
    { name: 'Jugador invierte 100K FXU, ya vendió 150K (más de lo invertido)', spent: 100000, earned: 150000, points: 1000 },
    { name: 'Jugador NO invierte, solo puntos', spent: 0, earned: 0, points: 5000 },
    { name: 'Jugador invierte 500K FXU, vendió 200K', spent: 500000, earned: 200000, points: 2000 },
  ];

  for (const s of scenarios) {
    const credit = Math.max(0, s.spent - s.earned);
    const pointsFxu = s.points * 0.001;
    const fxuLimit = pointsFxu + credit;
    
    console.log(`\n📌 ${s.name}`);
    console.log(`   Gastado: ${s.spent.toLocaleString()} | Ganado: ${s.earned.toLocaleString()} | Puntos: ${s.points}`);
    console.log(`   Crédito = MAX(0, ${s.spent.toLocaleString()} - ${s.earned.toLocaleString()}) = ${credit.toLocaleString()} FXU`);
    console.log(`   Límite FXU = ${pointsFxu} (pts) + ${credit.toLocaleString()} (crédito) = ${fxuLimit.toLocaleString()} FXU`);
    
    if (s.spent > 0) {
      const canRecover = credit;
      console.log(`   ♻️  Pendiente de recuperar: ${canRecover.toLocaleString()} FXU de ${s.spent.toLocaleString()} invertidos`);
      if (canRecover === 0) {
        console.log(`   ✅ ¡Ya recuperó toda su inversión!`);
      }
    }
  }

  // 8. P2P fees check - make sure they DON'T count
  console.log('\n' + '='.repeat(80));
  console.log('🚫 VERIFICACIÓN: Fees P2P NO dan ROI');
  console.log('='.repeat(80));

  const { rows: feeTypes } = await client.query(`
    SELECT revenue_type, COUNT(*) as txns, COALESCE(SUM(amount), 0) as total
    FROM admin_revenue
    WHERE revenue_type IN ('market_fee', 'swap_fee', 'transfer_fee', 'withdrawal_fee', 'expedition_fee')
      AND created_at >= '2026-03-29T00:00:00Z'
    GROUP BY revenue_type
    ORDER BY total DESC
  `);

  if (feeTypes.length === 0) {
    console.log('   No hay fees P2P desde el cutoff');
  } else {
    feeTypes.forEach(f => {
      console.log(`   ❌ ${f.revenue_type}: ${parseFloat(f.total).toLocaleString()} FXU (${f.txns} txns) → NO cuenta como inversión`);
    });
  }

  // 9. Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 RESUMEN DEL SISTEMA');
  console.log('='.repeat(80));
  console.log(`
  FÓRMULA DEL LÍMITE SEMANAL DE FXU:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  límite_fxu = (puntos × 0.001) + MAX(0, gastado_empresa - ganado_mercado)
  
  DONDE:
  • puntos × 0.001 = Límite base por ranking (todos tienen esto)
  • gastado_empresa = FXU gastado en servicios de la empresa:
    - plus_subscription, fleet_acceleration, officer_fxu
    - instant_ship, instant_build, instant_research, supply_box
  • ganado_mercado = FXU recibido por ventas en el mercado (después del cutoff)
  
  RESULTADO:
  ✅ Si inviertes 100K FXU → tu crédito ROI es 100K FXU
  ✅ Cuando vendes 50K FXU en el mercado → crédito baja a 50K FXU  
  ✅ Cuando vendes 100K FXU (todo recuperado) → crédito = 0 FXU
  ✅ Si vendes MÁS de lo invertido → crédito sigue en 0 (no negativo)
  ✅ Los puntos siempre dan un límite base adicional
  ✅ Las fees P2P (swap, transfer, market, withdrawal) NO dan crédito
  `);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
