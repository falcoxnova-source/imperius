const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Check current state
  const before = await c.query(`
    SELECT draw_number, status, accumulated_jackpot, prize_pool,
           accumulated_jackpot + COALESCE(prize_pool, 0) AS total_jackpot
    FROM lottery_draws WHERE status = 'open' ORDER BY draw_number DESC LIMIT 1
  `);
  console.log('=== BEFORE FIX ===');
  console.log(before.rows[0]);

  // Add back 15,000 that was incorrectly subtracted
  const fix = await c.query(`
    UPDATE lottery_draws 
    SET accumulated_jackpot = accumulated_jackpot + 15000
    WHERE status = 'open'
    RETURNING draw_number, accumulated_jackpot, prize_pool,
              accumulated_jackpot + COALESCE(prize_pool, 0) AS total_jackpot
  `);
  console.log('\n=== AFTER FIX (+15000) ===');
  console.log(fix.rows[0]);

  await c.end();
})();
