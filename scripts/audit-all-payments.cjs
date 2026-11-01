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
  console.log('============================================================');
  console.log('  AUDITORÍA COMPLETA: ¿El dinero llega al wallet del admin?');
  console.log('============================================================\n');

  // Get all payment functions and their full source
  const funcs = [
    'accelerate_fleet',
    'instant_complete_building',
    'instant_complete_research',
    'instant_complete_shipyard_item',
    'purchase_supply_box',
    'purchase_officer_with_fxu',
    'purchase_plus_subscription',
    'purchase_market_listing',
  ];

  for (const fname of funcs) {
    const res = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [fname]);
    if (res.rows.length === 0) {
      console.log(`❌ ${fname}: FUNCIÓN NO ENCONTRADA\n`);
      continue;
    }

    const src = res.rows[0].prosrc;

    // Check 1: Does it deduct FXU from user?
    const deductsUser = /UPDATE\s+profiles\s+SET\s+fxu_balance\s*=\s*fxu_balance\s*-/i.test(src);

    // Check 2: Does it call _internal_set_fxu_context?
    const hasFxuCtx = src.includes('_internal_set_fxu_context');

    // Check 3: Does it find the admin?
    const findsAdmin = /SELECT\s+id\s+INTO\s+v_admin_id\s+FROM\s+profiles\s+WHERE\s+is_admin/i.test(src);

    // Check 4: Does it credit admin wallet?
    const creditsAdmin = /UPDATE\s+profiles\s+SET\s+fxu_balance\s*=\s*fxu_balance\s*\+.*v_admin_id/is.test(src)
      || /WHERE\s+id\s*=\s*v_admin_id/i.test(src);

    // Check 5: Does it record admin_revenue?
    const recordsRevenue = src.includes('admin_revenue');

    // Check 6: Does it contribute to jackpot?
    const hasJackpot = src.includes('contribute_to_jackpot');

    // Determine status
    let status = '✅';
    let issues = [];

    if (!deductsUser) { issues.push('NO cobra al usuario'); }
    if (!hasFxuCtx) { issues.push('NO llama _internal_set_fxu_context (trigger bloqueará)'); }
    if (!creditsAdmin && fname !== 'purchase_market_listing') { 
      issues.push('🔴 NO PAGA AL ADMIN WALLET'); 
      status = '🔴';
    }
    if (!recordsRevenue) { issues.push('⚠️ No registra admin_revenue'); }

    // For market listing, fee logic is different - check specifically
    if (fname === 'purchase_market_listing') {
      const creditsAdminMarket = /fxu_balance\s*\+\s*v_admin_fee/i.test(src) 
        || /fxu_balance\s*=\s*fxu_balance\s*\+\s*v_admin_fee/i.test(src);
      if (!creditsAdminMarket) {
        issues.push('🔴 NO PAGA FEE AL ADMIN WALLET');
        status = '🔴';
      }
    }

    if (issues.length === 0) status = '✅';

    console.log(`${status} ${fname}`);
    console.log(`   Cobra usuario: ${deductsUser ? '✅' : '❌'}`);
    console.log(`   FXU context:   ${hasFxuCtx ? '✅' : '❌'}`);
    console.log(`   Busca admin:   ${findsAdmin ? '✅' : '❌'}`);
    console.log(`   Paga admin:    ${creditsAdmin ? '✅' : '❌'}`);
    console.log(`   admin_revenue: ${recordsRevenue ? '✅' : '❌'}`);
    console.log(`   Jackpot:       ${hasJackpot ? '✅' : '❌'}`);
    if (issues.length > 0) {
      console.log(`   ⚠️ ISSUES: ${issues.join(', ')}`);
    }
    console.log();
  }

  // Now verify with REAL DATA: compare admin_revenue totals vs what admin actually received
  console.log('============================================================');
  console.log('  VERIFICACIÓN CON DATOS REALES');
  console.log('============================================================\n');

  const adminRes = await client.query(`
    SELECT id, username, fxu_balance FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1
  `);
  const admin = adminRes.rows[0];
  console.log(`Admin: ${admin.username} | Balance: ${parseFloat(admin.fxu_balance).toFixed(2)} FXU\n`);

  // Check recent operations (last 24h) for each type
  console.log('--- Últimas 24h por tipo ---');
  const recent = await client.query(`
    SELECT revenue_type, COUNT(*) as cnt, SUM(amount) as total
    FROM admin_revenue
    WHERE created_at > now() - interval '24 hours'
    GROUP BY revenue_type
    ORDER BY total DESC
  `);
  recent.rows.forEach(r => {
    console.log(`  ${r.revenue_type}: ${r.cnt} ops, ${parseFloat(r.total).toFixed(2)} FXU`);
  });

  // Check if there are any functions that use instant_build or instant_research 
  // revenue types but might have different function names
  console.log('\n--- Buscando funciones adicionales de pago ---');
  const extraFuncs = await client.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc ILIKE '%fxu_balance%' 
      AND prosrc ILIKE '%admin%'
      AND prosrc ILIKE '%_internal_set_fxu_context%'
      AND proname NOT IN ('accelerate_fleet', 'instant_complete_building', 'instant_complete_research', 
          'instant_complete_shipyard_item', 'purchase_supply_box', 'purchase_officer_with_fxu',
          'purchase_plus_subscription', 'purchase_market_listing', 'protect_fxu_balance',
          '_internal_set_fxu_context')
    ORDER BY proname
  `);
  if (extraFuncs.rows.length > 0) {
    console.log('Otras funciones que manejan FXU + admin:');
    for (const r of extraFuncs.rows) {
      // Quick check if they credit admin
      const srcRes = await client.query(`SELECT prosrc FROM pg_proc WHERE proname = $1`, [r.proname]);
      const src = srcRes.rows[0].prosrc;
      const credits = /UPDATE\s+profiles\s+SET\s+fxu_balance\s*=\s*fxu_balance\s*\+.*admin/is.test(src)
        || /WHERE\s+id\s*=\s*v_admin_id/i.test(src);
      console.log(`  ${credits ? '✅' : '🔴'} ${r.proname}`);
    }
  } else {
    console.log('No se encontraron funciones adicionales.');
  }

  await client.end();
  console.log('\n============================================================');
  console.log('  AUDITORÍA COMPLETADA');
  console.log('============================================================');
}

main().catch(e => { console.error(e); process.exit(1); });
