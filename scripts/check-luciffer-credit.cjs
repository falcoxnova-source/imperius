const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await client.connect();

  // Get Luciffer's ID
  const { rows: [user] } = await client.query(
    "SELECT id, username, points_total FROM profiles WHERE username ILIKE '%lucif%'"
  );
  console.log('User:', user.username, '| Points:', user.points_total);

  // FXU spent (all time - from admin_revenue)
  const { rows: [spent] } = await client.query(
    `SELECT COALESCE(SUM(amount), 0) as total_spent
     FROM admin_revenue
     WHERE related_user_id = $1
     AND revenue_type IN ('instant_build','instant_research','instant_ship','officer_fxu','supply_box','fleet_acceleration','expedition_fee','swap_fee','transfer_fee','plus_subscription')`,
    [user.id]
  );
  console.log('FXU spent (all time):', spent.total_spent);

  // FXU earned WITHOUT cutoff (all market earnings)
  const { rows: [earnedAll] } = await client.query(
    `SELECT COALESCE(SUM(total_price), 0) as total_earned
     FROM market_transactions WHERE seller_id = $1`,
    [user.id]
  );
  console.log('FXU earned (ALL TIME, no cutoff):', earnedAll.total_earned);

  // FXU earned WITH cutoff
  const { rows: [cutoff] } = await client.query(
    "SELECT earnings_cutoff_date FROM market_resource_limits WHERE id = 1"
  );
  console.log('Cutoff date:', cutoff.earnings_cutoff_date);

  const { rows: [earnedCutoff] } = await client.query(
    `SELECT COALESCE(SUM(total_price), 0) as total_earned
     FROM market_transactions WHERE seller_id = $1 AND created_at >= $2`,
    [user.id, cutoff.earnings_cutoff_date]
  );
  console.log('FXU earned (after cutoff):', earnedCutoff.total_earned);

  const spentNum = parseFloat(spent.total_spent);
  const earnedAllNum = parseFloat(earnedAll.total_earned);
  const earnedCutoffNum = parseFloat(earnedCutoff.total_earned);

  console.log('\n=== CREDIT CALCULATION ===');
  console.log('With cutoff (CURRENT):    spent', spentNum, '- earned', earnedCutoffNum, '= credit', Math.max(0, spentNum - earnedCutoffNum));
  console.log('Without cutoff (CORRECT): spent', spentNum, '- earned', earnedAllNum, '= credit', Math.max(0, spentNum - earnedAllNum));

  const minPrice = 0.001;
  const pointsFxu = user.points_total * minPrice;
  console.log('\n=== FXU WEEKLY LIMIT ===');
  console.log('Points as FXU:', pointsFxu.toFixed(2));
  console.log('With cutoff:    ', (pointsFxu + Math.max(0, spentNum - earnedCutoffNum)).toFixed(2), 'FXU');
  console.log('Without cutoff: ', (pointsFxu + Math.max(0, spentNum - earnedAllNum)).toFixed(2), 'FXU');

  await client.end();
})();
