const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1. Find admin user
  const user = await c.query(
    "SELECT id, username, email, fxu_balance, rank_position, is_admin FROM profiles WHERE email = 'falcoxcorp@gmail.com'"
  );
  console.log('=== USUARIO ===');
  console.log(JSON.stringify(user.rows[0], null, 2));
  const uid = user.rows[0].id;

  // 2. Check active subscription
  const sub = await c.query(
    "SELECT ps.*, pp.name as plan_name, pp.duration_months FROM plus_subscriptions ps JOIN plus_plans pp ON ps.plan_id = pp.id WHERE ps.user_id = $1 AND ps.is_active = true AND ps.expires_at > now()",
    [uid]
  );
  console.log('\n=== SUSCRIPCION ACTIVA ===');
  if (sub.rows.length > 0) {
    console.log(JSON.stringify(sub.rows[0], null, 2));
  } else {
    console.log('*** NO HAY SUSCRIPCION ACTIVA ***');
  }

  // 3. Test is_user_plus
  const isPlus = await c.query("SELECT is_user_plus($1) as is_plus", [uid]);
  console.log('\n=== is_user_plus() ===');
  console.log('Result:', isPlus.rows[0].is_plus);

  // 4. Test market fee (should be 7.5% for VIP)
  const fee = await c.query("SELECT get_market_fee_for_user($1) as fee", [uid]);
  console.log('\n=== get_market_fee_for_user() ===');
  console.log('Fee:', fee.rows[0].fee, '% (expected 7.5 if VIP)');

  // 5. Check functions have VIP discount code
  const fns = [
    'calculate_fxu_cost_building',
    'calculate_fxu_cost_research',
    'calculate_fxu_cost_shipyard',
    'calculate_fxu_cost_fleet',
    'secure_abandon_colony',
    'instant_complete_research',
    'purchase_market_listing'
  ];

  console.log('\n=== VERIFICACION DE DESCUENTOS EN FUNCIONES ===');
  for (const fn of fns) {
    const res = await c.query("SELECT prosrc FROM pg_proc WHERE proname = $1 LIMIT 1", [fn]);
    if (res.rows.length > 0) {
      const src = res.rows[0].prosrc;
      const hasIsUserPlus = src.includes('is_user_plus');
      const has025 = src.includes('0.25');
      const has050 = src.includes('0.50') || src.includes('0.5');
      const has075 = src.includes('0.75');
      const has020 = src.includes('0.20') || src.includes('0.2');
      const hasFeeForUser = src.includes('get_market_fee_for_user');

      let discount = 'NONE';
      if (hasFeeForUser) discount = '7.5% fee (via get_market_fee_for_user)';
      else if (has025) discount = '75% off (pays 25%)';
      else if (has050) discount = '50% off (pays 50%)';
      else if (has075) discount = '25% off (pays 75%)';
      else if (has020) discount = '80% off (pays 20%)';

      const status = hasIsUserPlus || hasFeeForUser ? '✅' : '❌';
      console.log(`${status} ${fn}: VIP check=${hasIsUserPlus || hasFeeForUser}, discount=${discount}`);
    } else {
      console.log(`❌ ${fn}: FUNCTION NOT FOUND`);
    }
  }

  // 6. Check revenue record
  const rev = await c.query(
    "SELECT revenue_type, amount, description, created_at FROM admin_revenue WHERE related_user_id = $1 ORDER BY created_at DESC LIMIT 5",
    [uid]
  );
  console.log('\n=== ADMIN REVENUE (ultimos 5) ===');
  for (const r of rev.rows) {
    console.log(`  ${r.revenue_type}: ${r.amount} FXU - ${r.description} (${new Date(r.created_at).toLocaleString()})`);
  }

  // 7. Check all active subs
  const allSubs = await c.query(
    "SELECT ps.user_id, p.username, pp.name, ps.expires_at, ps.is_active FROM plus_subscriptions ps JOIN profiles p ON ps.user_id = p.id JOIN plus_plans pp ON ps.plan_id = pp.id WHERE ps.is_active = true AND ps.expires_at > now()"
  );
  console.log('\n=== TODOS LOS SUSCRIPTORES VIP ACTIVOS ===');
  for (const s of allSubs.rows) {
    console.log(`  ${s.username} - ${s.name} - expira: ${new Date(s.expires_at).toLocaleDateString()}`);
  }

  await c.end();
}

main().catch(console.error);
