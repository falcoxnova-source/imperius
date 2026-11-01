const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Full buy_lottery_ticket
  console.log('=== buy_lottery_ticket FUNCTION ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'buy_lottery_ticket' LIMIT 1`);
  if (fn.rows[0]) {
    const src = fn.rows[0].prosrc;
    // Show pool/admin split
    const lines = src.split('\n');
    const relevant = lines.filter(l => 
      l.includes('v_pool') || l.includes('v_admin') || l.includes('v_ticket') || 
      l.includes('contribute') || l.includes('admin_revenue') || l.includes('50') || 
      l.includes('percent') || l.includes('amount')
    );
    console.log(relevant.join('\n'));
  }

  // Full accelerate_fleet
  console.log('\n=== accelerate_fleet FUNCTION (full) ===');
  const fn2 = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'accelerate_fleet' LIMIT 1`);
  if (fn2.rows[0]) {
    const src = fn2.rows[0].prosrc;
    const lines = src.split('\n');
    const relevant = lines.filter(l => 
      l.includes('jackpot') || l.includes('revenue') || l.includes('v_fxu_cost') || 
      l.includes('v_jackpot') || l.includes('contribute') || l.includes('percent')
    );
    console.log(relevant.join('\n'));
  }

  // Recent contributions by source (summary)
  console.log('\n=== CONTRIBUTIONS BY SOURCE (last 30 days) ===');
  const contrib = await c.query(`
    SELECT source, COUNT(*) as count, SUM(amount) as total_amount 
    FROM jackpot_history 
    WHERE type = 'contribution' AND created_at > now() - interval '30 days'
    GROUP BY source 
    ORDER BY total_amount DESC
  `);
  for (const row of contrib.rows) {
    console.log(`  ${row.source}: ${row.count} txns, total ${row.total_amount} FXU`);
  }

  // Recent distributions from pools
  console.log('\n=== RECENT DISTRIBUTIONS ===');
  
  // Monthly pool distributions
  const monthly = await c.query(`SELECT distribution_month, total_pool_amount, distributed_at FROM monthly_ranking_distributions ORDER BY distributed_at DESC LIMIT 3`);
  console.log('Monthly TOP 50 distributions:');
  for (const row of monthly.rows) {
    console.log(`  ${row.distribution_month} - ${row.total_pool_amount} FXU at ${row.distributed_at}`);
  }

  // Social ranking distributions
  const social = await c.query(`SELECT distribution_month, total_pool_amount, total_distributed, total_participants, distributed_at FROM social_ranking_distributions ORDER BY distributed_at DESC LIMIT 3`);
  console.log('Social ranking distributions:');
  for (const row of social.rows) {
    console.log(`  ${row.distribution_month} - pool: ${row.total_pool_amount}, distributed: ${row.total_distributed}, participants: ${row.total_participants} at ${row.distributed_at}`);
  }

  // Destruction ranking distributions
  const destr = await c.query(`SELECT distribution_month, total_pool_amount, total_distributed, total_participants, distributed_at FROM destruction_ranking_distributions ORDER BY distributed_at DESC LIMIT 3`);
  console.log('Destruction ranking distributions:');
  for (const row of destr.rows) {
    console.log(`  ${row.distribution_month} - pool: ${row.total_pool_amount}, distributed: ${row.total_distributed}, participants: ${row.total_participants} at ${row.distributed_at}`);
  }

  // Expedition pool wins
  const expWins = await c.query(`SELECT COUNT(*) as count, SUM(amount) as total FROM jackpot_history WHERE type='win' AND source='expedition_pool' AND created_at > now() - interval '30 days'`);
  console.log(`Expedition pool wins (30 days): ${expWins.rows[0].count} wins, total ${expWins.rows[0].total} FXU`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
