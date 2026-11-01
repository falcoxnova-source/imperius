const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // All winners with their current balance
  const r = await c.query(`
    SELECT lw.matches, lw.prize, lw.numbers, lw.winning_numbers,
           p.username, p.fxu_balance,
           ld.draw_number
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    ORDER BY ld.draw_number, lw.matches DESC, p.username
  `);
  
  console.log('=== ALL LOTTERY WINNERS WITH CURRENT BALANCE ===');
  r.rows.forEach(w => {
    console.log(`Sorteo #${w.draw_number} | ${w.username} | matches=${w.matches} | prize=${w.prize} FXU | current_balance=${w.fxu_balance} FXU`);
  });

  // Check fxu_transactions for lottery payments
  const r2 = await c.query(`
    SELECT ft.amount, ft.type, ft.description, ft.created_at,
           p.username
    FROM fxu_transactions ft
    JOIN profiles p ON p.id = ft.user_id
    WHERE ft.description ILIKE '%loter%' OR ft.description ILIKE '%lottery%' OR ft.description ILIKE '%sorteo%' OR ft.type ILIKE '%lottery%'
    ORDER BY ft.created_at DESC
    LIMIT 50
  `);

  console.log('\n=== FXU TRANSACTIONS RELATED TO LOTTERY ===');
  if (r2.rows.length === 0) {
    console.log('(No lottery-related transactions found in fxu_transactions)');
  } else {
    r2.rows.forEach(t => {
      console.log(`${t.username} | ${t.amount} FXU | type=${t.type} | ${t.description} | ${t.created_at}`);
    });
  }

  // Check if there's a user with ~8200 FXU who won in Sorteo #1
  const r3 = await c.query(`
    SELECT p.username, p.fxu_balance, lw.prize, lw.matches, lw.numbers, ld.draw_number
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.draw_number = 1
    AND p.fxu_balance BETWEEN 7500 AND 9000
  `);

  console.log('\n=== SORTEO #1 WINNERS WITH ~8200 FXU BALANCE ===');
  if (r3.rows.length === 0) {
    console.log('(No winners from Sorteo #1 with balance near 8200)');
  } else {
    r3.rows.forEach(w => {
      console.log(`${w.username} | balance=${w.fxu_balance} | prize=${w.prize} | matches=${w.matches} | nums=${JSON.stringify(w.numbers)}`);
    });
  }

  // Also check: Sorteo #1 prize config at the time (was it 500 or 1000?)
  const r4 = await c.query(`
    SELECT draw_number, winning_numbers FROM lottery_draws WHERE draw_number = 1
  `);
  console.log('\n=== SORTEO #1 WINNING NUMBERS ===');
  console.log(r4.rows[0]);

  await c.end();
})();
