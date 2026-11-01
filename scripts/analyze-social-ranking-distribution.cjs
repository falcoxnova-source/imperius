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

  // 1. Get all distributions
  const dists = await c.query(`
    SELECT id, distribution_month, total_pool_amount, total_participants, total_distributed
    FROM social_ranking_distributions
    ORDER BY distribution_month DESC
  `);
  console.log('=== SOCIAL RANKING DISTRIBUTIONS ===');
  dists.rows.forEach(d => {
    console.log(`\nDistribution: ${d.distribution_month} | Pool: ${d.total_pool_amount} FXU | Distributed: ${d.total_distributed} FXU | Participants: ${d.total_participants}`);
  });

  // 2. Get reward details for each distribution
  for (const dist of dists.rows) {
    const rewards = await c.query(`
      SELECT sr.user_id, p.username, sr.points_at_distribution, sr.reward_amount, sr.reward_percent
      FROM social_ranking_rewards sr
      JOIN profiles p ON p.id = sr.user_id
      WHERE sr.distribution_id = $1
      ORDER BY sr.reward_amount DESC
    `, [dist.id]);
    
    console.log(`\n--- Rewards for ${dist.distribution_month} (Pool: ${dist.total_pool_amount} FXU) ---`);
    console.log(`${'#'.padEnd(4)} ${'Username'.padEnd(30)} ${'Points'.padEnd(10)} ${'FXU'.padEnd(15)} ${'%'.padEnd(8)}`);
    console.log('-'.repeat(70));
    
    let totalFxu = 0;
    rewards.rows.forEach((r, i) => {
      totalFxu += parseFloat(r.reward_amount);
      const rank = i + 1;
      console.log(
        `${('#'+rank).padEnd(4)} ${r.username.padEnd(30)} ${String(r.points_at_distribution).padEnd(10)} ${String(r.reward_amount).padEnd(15)} ${r.reward_percent}%`
      );
    });
    console.log('-'.repeat(70));
    console.log(`Total distributed: ${totalFxu} FXU | Participants: ${rewards.rows.length}`);
    
    // Show the exponential gap
    if (rewards.rows.length >= 2) {
      const top = parseFloat(rewards.rows[0].reward_amount);
      const second = parseFloat(rewards.rows[1].reward_amount);
      const last = parseFloat(rewards.rows[rewards.rows.length - 1].reward_amount);
      console.log(`\n📊 Gap analysis:`);
      console.log(`  #1 gets ${top} FXU (${rewards.rows[0].reward_percent}%)`);
      console.log(`  #2 gets ${second} FXU (${rewards.rows[1].reward_percent}%)`);
      console.log(`  Last gets ${last} FXU (${rewards.rows[rewards.rows.length-1].reward_percent}%)`);
      console.log(`  #1 vs #2 ratio: ${(top/second).toFixed(2)}x`);
      console.log(`  #1 vs last ratio: ${(top/last).toFixed(2)}x`);
      console.log(`  #1 gets ${((top/totalFxu)*100).toFixed(1)}% of total pool`);
    }
  }

  // 3. Simulate: what would a LINEAR distribution look like? (N+1-rank weight like destruction)
  console.log('\n\n=== COMPARISON: EXPONENTIAL vs LINEAR ===');
  for (const dist of dists.rows) {
    const rewards = await c.query(`
      SELECT sr.user_id, p.username, sr.points_at_distribution, sr.reward_amount
      FROM social_ranking_rewards sr
      JOIN profiles p ON p.id = sr.user_id
      WHERE sr.distribution_id = $1
      ORDER BY sr.reward_amount DESC
    `, [dist.id]);
    
    const n = rewards.rows.length;
    const pool = parseFloat(dist.total_pool_amount);
    
    // Current exponential: 1.5^(N-rank)
    let totalExpWeight = 0;
    for (let i = 1; i <= n; i++) totalExpWeight += Math.pow(1.5, n - i);
    
    // Linear: (N+1-rank)
    const totalLinWeight = n * (n + 1) / 2;
    
    console.log(`\nPool: ${pool} FXU | ${n} participants`);
    console.log(`${'#'.padEnd(4)} ${'Username'.padEnd(25)} ${'EXP (actual)'.padEnd(18)} ${'LINEAR (alt)'.padEnd(18)} ${'Difference'.padEnd(15)}`);
    console.log('-'.repeat(85));
    
    for (let i = 0; i < n; i++) {
      const rank = i + 1;
      const expWeight = Math.pow(1.5, n - rank);
      const expReward = Math.floor(pool * expWeight / totalExpWeight);
      const linWeight = n + 1 - rank;
      const linReward = Math.floor(pool * linWeight / totalLinWeight);
      const diff = expReward - linReward;
      
      console.log(
        `${('#'+rank).padEnd(4)} ${rewards.rows[i].username.padEnd(25)} ${String(expReward).padEnd(18)} ${String(linReward).padEnd(18)} ${(diff > 0 ? '+' : '') + diff}`
      );
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
