const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Find users who bought ~10 tickets in Sorteo #1 and have ~8200 FXU balance
  const r = await c.query(`
    SELECT p.username, p.fxu_balance, COUNT(lt.id) as tickets_bought,
           SUM(CASE WHEN lt.matches >= 2 THEN 1 ELSE 0 END) as winning_tickets,
           SUM(COALESCE(lt.prize, 0)) as total_prize
    FROM lottery_tickets lt
    JOIN profiles p ON p.id = lt.user_id
    JOIN lottery_draws ld ON ld.id = lt.draw_id
    WHERE ld.draw_number = 1
    GROUP BY p.username, p.fxu_balance
    ORDER BY tickets_bought DESC
  `);
  
  console.log('=== SORTEO #1: TICKETS BOUGHT PER USER ===');
  r.rows.forEach(w => {
    console.log(`${w.username} | tickets=${w.tickets_bought} | winning=${w.winning_tickets} | total_prize=${w.total_prize} FXU | current_balance=${parseFloat(w.fxu_balance).toFixed(2)} FXU`);
  });

  // Also check Sorteo #1 winners who have balance near 8200
  const r2 = await c.query(`
    SELECT p.username, p.fxu_balance, lw.prize, lw.numbers, lw.winning_numbers
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.draw_number = 1
      AND p.fxu_balance BETWEEN 7000 AND 9500
    ORDER BY p.fxu_balance
  `);

  console.log('\n=== SORTEO #1 WINNERS WITH BALANCE 7000-9500 ===');
  r2.rows.forEach(w => {
    console.log(`${w.username} | balance=${parseFloat(w.fxu_balance).toFixed(2)} | prize=${w.prize} | nums=${JSON.stringify(w.numbers)} | winning=${JSON.stringify(w.winning_numbers)}`);
  });

  await c.end();
})();
