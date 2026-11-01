const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // Check sorteo #2 details
  const r1 = await c.query(`
    SELECT draw_number, accumulated_jackpot, prize_pool, total_pool,
           (SELECT SUM(prize) FROM lottery_winners WHERE draw_id = ld.id) as total_prizes_paid,
           (SELECT COUNT(*) FROM lottery_winners WHERE draw_id = ld.id AND matches = 2) as winners_2,
           (SELECT COUNT(*) FROM lottery_winners WHERE draw_id = ld.id AND matches = 3) as winners_3
    FROM lottery_draws ld WHERE draw_number = 2
  `);
  console.log('=== SORTEO #2 ===');
  console.log(r1.rows[0]);

  // Check sorteo #3 current state
  const r2 = await c.query(`
    SELECT draw_number, accumulated_jackpot, prize_pool, total_pool, total_tickets, status
    FROM lottery_draws WHERE draw_number = 3
  `);
  console.log('\n=== SORTEO #3 (CURRENT) ===');
  console.log(r2.rows[0]);

  // Check sorteo #1 prizes
  const r3 = await c.query(`
    SELECT draw_number, accumulated_jackpot, prize_pool, total_pool,
           (SELECT SUM(prize) FROM lottery_winners WHERE draw_id = ld.id) as total_prizes_paid
    FROM lottery_draws ld WHERE draw_number = 1
  `);
  console.log('\n=== SORTEO #1 ===');
  console.log(r3.rows[0]);

  // Check current lottery prize settings
  const r4 = await c.query(`SELECT key, value FROM game_settings WHERE key LIKE 'lottery%prize%'`);
  console.log('\n=== PRIZE SETTINGS ===');
  console.log(r4.rows);

  await c.end();
})();
