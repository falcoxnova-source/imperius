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

  // Find krauser
  const user = await c.query(`
    SELECT id, username, fxu_balance, usdt_balance, points_total, created_at,
           referred_by
    FROM profiles 
    WHERE LOWER(username) LIKE '%krauser%'
  `);
  if (user.rows.length === 0) { console.log('User not found'); await c.end(); return; }
  const u = user.rows[0];
  console.log(`=== PLAYER: ${u.username} ===`);
  console.log(`ID: ${u.id}`);
  console.log(`Created: ${u.created_at}`);
  console.log(`FXU balance: ${u.fxu_balance}`);
  console.log(`USDT balance: ${u.usdt_balance}`);
  console.log(`Points: ${u.points_total}`);
  console.log(`Referred by: ${u.referred_by || 'none'}`);

  // --- DEPOSITS ---
  const deposits = await c.query(`
    SELECT token_type, SUM(fxu_amount) as total_fxu, SUM(amount) as total_net, COUNT(*) as cnt
    FROM wallet_transactions
    WHERE user_id = $1 AND tx_type = 'deposit' AND status = 'confirmed'
    GROUP BY token_type
  `, [u.id]);
  console.log('\n--- DEPOSITS ---');
  deposits.rows.forEach(r => console.log(`  ${r.token_type}: ${r.total_fxu} FXU (net: ${r.total_net}) [${r.cnt} ops]`));

  // --- WITHDRAWALS ---
  const withdrawals = await c.query(`
    SELECT token_type, status, SUM(fxu_amount) as total_gross, SUM(amount) as total_net, COUNT(*) as cnt
    FROM wallet_transactions
    WHERE user_id = $1 AND tx_type = 'withdrawal'
    GROUP BY token_type, status
  `, [u.id]);
  console.log('\n--- WITHDRAWALS ---');
  withdrawals.rows.forEach(r => console.log(`  ${r.token_type} (${r.status}): gross=${r.total_gross}, net=${r.total_net} [${r.cnt} ops]`));

  // Withdrawal detail
  const wdDetail = await c.query(`
    SELECT token_type, fxu_amount, amount, status, created_at
    FROM wallet_transactions
    WHERE user_id = $1 AND tx_type = 'withdrawal'
    ORDER BY created_at DESC
    LIMIT 20
  `, [u.id]);
  console.log('\n--- RECENT WITHDRAWALS (last 20) ---');
  wdDetail.rows.forEach(r => console.log(`  ${r.created_at} | ${r.token_type} | gross=${r.fxu_amount} net=${r.amount} | ${r.status}`));

  // --- SWAPS ---
  const swaps = await c.query(`
    SELECT token_type, tx_type, SUM(fxu_amount) as total_fxu, SUM(amount) as total_amount, COUNT(*) as cnt
    FROM wallet_transactions
    WHERE user_id = $1 AND tx_type IN ('swap_fxu_to_usdt', 'swap_usdt_to_fxu')
    GROUP BY token_type, tx_type
  `, [u.id]);
  console.log('\n--- SWAPS ---');
  swaps.rows.forEach(r => console.log(`  ${r.tx_type}: fxu=${r.total_fxu}, amount=${r.total_amount} [${r.cnt} ops]`));

  // --- MARKET SALES (FXU earned) ---
  const sales = await c.query(`
    SELECT SUM(mt.total_price) as total_earned, COUNT(*) as cnt
    FROM market_transactions mt
    WHERE mt.seller_id = $1
  `, [u.id]);
  console.log('\n--- MARKET SALES ---');
  console.log(`  Total FXU earned from sales: ${sales.rows[0].total_earned || 0} [${sales.rows[0].cnt} listings]`);

  // --- MARKET PURCHASES (FXU spent) ---
  const purchases = await c.query(`
    SELECT SUM(mt.total_price) as total_spent, COUNT(*) as cnt
    FROM market_transactions mt
    WHERE mt.buyer_id = $1
  `, [u.id]);
  console.log('\n--- MARKET PURCHASES ---');
  console.log(`  Total FXU spent buying: ${purchases.rows[0].total_spent || 0} [${purchases.rows[0].cnt} purchases]`);

  // --- SPENDING (admin_revenue) ---
  const spending = await c.query(`
    SELECT revenue_type, SUM(amount) as total, COUNT(*) as cnt
    FROM admin_revenue
    WHERE related_user_id = $1
    GROUP BY revenue_type
    ORDER BY total DESC
  `, [u.id]);
  console.log('\n--- FXU SPENT ON SERVICES ---');
  spending.rows.forEach(r => console.log(`  ${r.revenue_type}: ${r.total} [${r.cnt} ops]`));

  // --- TRANSFERS SENT ---
  const txSent = await c.query(`
    SELECT token_type, SUM(gross_amount) as total_gross, SUM(net_amount) as total_net, COUNT(*) as cnt
    FROM internal_transfers
    WHERE sender_id = $1
    GROUP BY token_type
  `, [u.id]);
  console.log('\n--- TRANSFERS SENT ---');
  txSent.rows.forEach(r => console.log(`  ${r.token_type}: gross=${r.total_gross}, net=${r.total_net} [${r.cnt}]`));

  // --- TRANSFERS RECEIVED ---
  const txRecv = await c.query(`
    SELECT token_type, SUM(net_amount) as total_net, COUNT(*) as cnt
    FROM internal_transfers
    WHERE receiver_id = $1
    GROUP BY token_type
  `, [u.id]);
  console.log('\n--- TRANSFERS RECEIVED ---');
  txRecv.rows.forEach(r => console.log(`  ${r.token_type}: net=${r.total_net} [${r.cnt}]`));

  // --- JACKPOT / RANKING REWARDS ---
  const monthlyRewards = await c.query(`
    SELECT SUM(reward_amount) as total, COUNT(*) as cnt
    FROM monthly_ranking_rewards WHERE user_id = $1
  `, [u.id]);
  console.log('\n--- MONTHLY RANKING REWARDS ---');
  console.log(`  Total: ${monthlyRewards.rows[0].total || 0} [${monthlyRewards.rows[0].cnt} times]`);

  const destRewards = await c.query(`
    SELECT SUM(reward_amount) as total, COUNT(*) as cnt
    FROM destruction_ranking_rewards WHERE user_id = $1
  `, [u.id]);
  console.log('\n--- DESTRUCTION RANKING REWARDS ---');
  console.log(`  Total: ${destRewards.rows[0].total || 0} [${destRewards.rows[0].cnt} times]`);

  const socialRewards = await c.query(`
    SELECT SUM(reward_amount) as total, COUNT(*) as cnt
    FROM social_ranking_rewards WHERE user_id = $1
  `, [u.id]);
  console.log('\n--- SOCIAL RANKING REWARDS ---');
  console.log(`  Total: ${socialRewards.rows[0].total || 0} [${socialRewards.rows[0].cnt} times]`);

  // --- REFERRAL COMMISSIONS ---
  const refEarned = await c.query(`
    SELECT SUM(fxu_amount) as total, COUNT(*) as cnt
    FROM referral_commissions WHERE referrer_id = $1
  `, [u.id]);
  console.log('\n--- REFERRAL COMMISSIONS EARNED ---');
  console.log(`  Total: ${refEarned.rows[0].total || 0} [${refEarned.rows[0].cnt} times]`);

  // --- SUPPLY BOX ---
  let supply = { rows: [{ cnt: 0, total_cost: 0, total_won: 0 }] };
  try {
    supply = await c.query(`
      SELECT SUM(fxu_cost) as total_cost, SUM(fxu_won) as total_won, COUNT(*) as cnt
      FROM supply_box_history WHERE user_id = $1
    `, [u.id]);
  } catch(e) { /* table may not exist */ }
  console.log('\n--- SUPPLY BOX ---');
  if (supply.rows[0].cnt > 0) {
    console.log(`  Cost: ${supply.rows[0].total_cost}, Won: ${supply.rows[0].total_won} [${supply.rows[0].cnt} boxes]`);
  } else {
    console.log('  None');
  }

  // --- EXPEDITIONS FXU ---
  let expeditions = { rows: [{ fxu_found: 0, fxu_finds: 0 }] };
  try {
    expeditions = await c.query(`
      SELECT SUM(CASE WHEN result_type = 'fxu_found' THEN fxu_amount ELSE 0 END) as fxu_found,
             COUNT(*) FILTER (WHERE result_type = 'fxu_found') as fxu_finds
      FROM expedition_results WHERE user_id = $1
    `, [u.id]);
  } catch(e) { /* table may not exist */ }
  console.log('\n--- EXPEDITIONS FXU FOUND ---');
  console.log(`  Total: ${expeditions.rows[0].fxu_found || 0} [${expeditions.rows[0].fxu_finds} finds]`);

  // --- FLOW SUMMARY ---
  console.log('\n\n========== ECONOMY FLOW SUMMARY ==========');
  
  const depFxu = deposits.rows.find(r => r.token_type !== 'USDT')?.total_fxu || 0;
  const depUsdt = deposits.rows.find(r => r.token_type === 'USDT')?.total_fxu || 0;
  const wdFxu = withdrawals.rows.filter(r => r.token_type !== 'USDT' && r.status === 'confirmed').reduce((s,r) => s + parseFloat(r.total_gross), 0);
  const wdUsdt = withdrawals.rows.filter(r => r.token_type === 'USDT' && r.status === 'confirmed').reduce((s,r) => s + parseFloat(r.total_gross), 0);
  
  console.log(`DEPOSITS:  FXU=${depFxu}, USDT=${depUsdt}`);
  console.log(`WITHDRAWALS: FXU=${wdFxu}, USDT_gross=${wdUsdt}`);
  console.log(`MARKET SALES: ${sales.rows[0].total_earned || 0} FXU earned`);
  console.log(`MARKET BUYS: ${purchases.rows[0].total_spent || 0} FXU spent`);
  console.log(`RANKINGS: monthly=${monthlyRewards.rows[0].total||0}, destruction=${destRewards.rows[0].total||0}, social=${socialRewards.rows[0].total||0}`);
  console.log(`REFERRALS: ${refEarned.rows[0].total || 0}`);
  console.log(`EXPEDITIONS: ${expeditions.rows[0].fxu_found || 0}`);
  console.log(`CURRENT: FXU=${u.fxu_balance}, USDT=${u.usdt_balance}`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
