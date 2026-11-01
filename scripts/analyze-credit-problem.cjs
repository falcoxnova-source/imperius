const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  
  console.log('='.repeat(80));
  console.log('ANÁLISIS: PROBLEMA DE GANANCIAS PASADAS vs INVERSIONES NUEVAS');
  console.log('='.repeat(80));

  // Get all players with significant earnings AND spending after cutoff
  const { rows: players } = await client.query(`
    WITH spending AS (
      SELECT related_user_id as uid, COALESCE(SUM(amount), 0) as total_spent
      FROM admin_revenue
      WHERE revenue_type IN ('plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
        AND created_at >= '2026-03-29T00:00:00Z'
      GROUP BY related_user_id
    ),
    earning AS (
      SELECT mt.seller_id as uid, COALESCE(SUM(mt.total_price), 0) as total_earned
      FROM market_transactions mt
      JOIN market_listings ml ON ml.id = mt.listing_id
      WHERE ml.listing_type IN ('resource', 'ship')
        AND mt.created_at >= '2026-03-29T00:00:00Z'
      GROUP BY mt.seller_id
    )
    SELECT 
      p.username,
      p.points_total,
      COALESCE(s.total_spent, 0) as spent,
      COALESCE(e.total_earned, 0) as earned,
      GREATEST(0, COALESCE(s.total_spent, 0) - COALESCE(e.total_earned, 0)) as current_credit
    FROM profiles p
    LEFT JOIN spending s ON s.uid = p.id
    LEFT JOIN earning e ON e.uid = p.id
    WHERE COALESCE(s.total_spent, 0) > 0 OR COALESCE(e.total_earned, 0) > 1000
    ORDER BY COALESCE(e.total_earned, 0) DESC
    LIMIT 20
  `);

  console.log('\n📊 JUGADORES CON GANANCIAS Y/O GASTOS (después del cutoff):');
  console.log('-'.repeat(80));
  console.log('Player'.padEnd(25), 'Ganado'.padStart(12), 'Gastado'.padStart(12), 'Crédito'.padStart(12), 'Problema?');
  console.log('-'.repeat(80));
  
  for (const p of players) {
    const earned = parseFloat(p.earned);
    const spent = parseFloat(p.spent);
    const credit = parseFloat(p.current_credit);
    const problem = earned > spent && spent > 0 ? '⚠️ SÍ' : (earned > 0 && spent === 0 ? '🔶 Sin gasto' : '✅ OK');
    
    console.log(
      p.username.substring(0, 24).padEnd(25),
      earned.toLocaleString().padStart(12),
      spent.toLocaleString().padStart(12),
      credit.toLocaleString().padStart(12),
      problem
    );
  }

  // Now simulate the PROBLEM scenario
  console.log('\n' + '='.repeat(80));
  console.log('🔴 DEMOSTRACIÓN DEL PROBLEMA');
  console.log('='.repeat(80));
  
  console.log(`
  FÓRMULA ACTUAL (ROTA):
    credit = MAX(0, total_gastado - total_ganado)
  
  ESCENARIO: Jugador hizo x8 (ganó 800K) y luego invierte 100K
    credit = MAX(0, 100K - 800K) = 0 ❌
    
  El jugador invirtió 100K pero NO obtiene crédito porque las
  ganancias pasadas "absorben" la inversión nueva.
  
  RESULTADO: Nadie quiere invertir si ya ha vendido en el mercado.
  `);

  // Get chronological events for top earner to show the problem
  const { rows: topEarners } = await client.query(`
    SELECT mt.seller_id, p.username, SUM(mt.total_price) as total_earned
    FROM market_transactions mt
    JOIN market_listings ml ON ml.id = mt.listing_id
    JOIN profiles p ON p.id = mt.seller_id
    WHERE ml.listing_type IN ('resource', 'ship')
      AND mt.created_at >= '2026-03-29T00:00:00Z'
    GROUP BY mt.seller_id, p.username
    ORDER BY total_earned DESC
    LIMIT 5
  `);

  for (const earner of topEarners) {
    const uid = earner.seller_id;
    
    // Get chronological events
    const { rows: events } = await client.query(`
      (
        SELECT created_at, amount as delta, 'GASTO' as tipo, revenue_type as detalle
        FROM admin_revenue
        WHERE related_user_id = $1
          AND revenue_type IN ('plus_subscription','fleet_acceleration','officer_fxu','instant_ship','instant_build','instant_research','supply_box')
          AND created_at >= '2026-03-29T00:00:00Z'
      )
      UNION ALL
      (
        SELECT mt.created_at, mt.total_price as delta, 'VENTA' as tipo, ml.item_code as detalle
        FROM market_transactions mt
        JOIN market_listings ml ON ml.id = mt.listing_id
        WHERE mt.seller_id = $1
          AND ml.listing_type IN ('resource', 'ship')
          AND mt.created_at >= '2026-03-29T00:00:00Z'
      )
      ORDER BY created_at
    `, [uid]);

    if (events.length === 0) continue;

    console.log(`\n👤 ${earner.username} - Ganó ${parseFloat(earner.total_earned).toLocaleString()} FXU`);
    
    // Simulate CURRENT (broken) model
    let totalSpent = 0, totalEarned = 0;
    for (const e of events) {
      if (e.tipo === 'GASTO') totalSpent += parseFloat(e.delta);
      else totalEarned += parseFloat(e.delta);
    }
    const brokenCredit = Math.max(0, totalSpent - totalEarned);
    
    // Simulate CORRECT (running balance) model
    let runningCredit = 0;
    for (const e of events) {
      if (e.tipo === 'GASTO') {
        runningCredit += parseFloat(e.delta);
      } else {
        runningCredit -= parseFloat(e.delta);
        if (runningCredit < 0) runningCredit = 0;
      }
    }
    
    console.log(`   Fórmula ACTUAL (rota):  credit = MAX(0, ${totalSpent.toLocaleString()} - ${totalEarned.toLocaleString()}) = ${brokenCredit.toLocaleString()} FXU`);
    console.log(`   Fórmula CORRECTA:       credit = ${runningCredit.toLocaleString()} FXU (balance corrido con piso en 0)`);
    
    if (brokenCredit !== runningCredit) {
      console.log(`   ⚠️  DIFERENCIA: ${(runningCredit - brokenCredit).toLocaleString()} FXU`);
    }
    
    // Show first 10 events with running balance
    let rc = 0;
    console.log(`   Eventos cronológicos:`);
    for (let i = 0; i < Math.min(events.length, 15); i++) {
      const e = events[i];
      const delta = parseFloat(e.delta);
      if (e.tipo === 'GASTO') {
        rc += delta;
        console.log(`     ${e.created_at.toISOString().substring(11,19)} ${e.tipo} +${delta.toLocaleString()} (${e.detalle}) → crédito = ${rc.toLocaleString()}`);
      } else {
        const before = rc;
        rc = Math.max(0, rc - delta);
        console.log(`     ${e.created_at.toISOString().substring(11,19)} ${e.tipo} -${delta.toLocaleString()} (${e.detalle}) → crédito = ${rc.toLocaleString()}${before < delta ? ' (piso 0)' : ''}`);
      }
    }
    if (events.length > 15) console.log(`     ... +${events.length - 15} eventos más`);
  }

  // Summary of the fix
  console.log('\n' + '='.repeat(80));
  console.log('✅ SOLUCIÓN: BALANCE CORRIDO CON PISO EN 0');
  console.log('='.repeat(80));
  console.log(`
  REGLA NUEVA:
  - Cada GASTO en la empresa → SUMA al crédito
  - Cada VENTA en el mercado → RESTA del crédito (pero nunca baja de 0)
  
  EJEMPLO:
  1. Jugador vende 800K en mercado → crédito = 0 (no hay inversión, piso en 0)
  2. Jugador invierte 100K FXU     → crédito = 100K ✅
  3. Jugador vende 50K en mercado  → crédito = 50K (va recuperando)
  4. Jugador vende 60K en mercado  → crédito = 0 (ya recuperó los 100K)
  
  vs FÓRMULA ROTA ACTUAL:
  1. Jugador vende 800K en mercado → earned = 800K
  2. Jugador invierte 100K FXU     → credit = MAX(0, 100K - 800K) = 0 ❌
  
  DIFERENCIA CLAVE:
  Las ganancias pasadas NO absorben inversiones futuras.
  Cada inversión empieza "limpia".
  `);

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
