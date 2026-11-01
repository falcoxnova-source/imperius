const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();

  // 1. Check lottery_winners for draw #2 - prizes recorded
  const { rows: winners } = await c.query(`
    SELECT lw.matches, lw.prize, lw.numbers, lw.winning_numbers,
           p.username, p.fxu_balance
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.draw_number = 2
    ORDER BY lw.matches DESC, lw.prize DESC
  `);

  console.log('=== GANADORES SORTEO #2 (lottery_winners) ===');
  console.log(`Total registros: ${winners.length}\n`);
  let totalPaid = 0;
  for (const w of winners) {
    console.log(`  ${w.username} | ${w.matches} aciertos | Premio: ${w.prize} FXU | Balance actual: ${Math.floor(w.fxu_balance)} FXU | Nums: [${w.numbers}]`);
    totalPaid += Number(w.prize);
  }
  console.log(`\nTotal premios registrados: ${totalPaid} FXU`);

  // 2. Check lottery_tickets for draw #2 - prizes on tickets
  const { rows: tickets } = await c.query(`
    SELECT lt.matches, lt.prize, lt.numbers, p.username
    FROM lottery_tickets lt
    JOIN profiles p ON p.id = lt.user_id
    JOIN lottery_draws ld ON ld.id = lt.draw_id
    WHERE ld.draw_number = 2 AND lt.matches >= 2
    ORDER BY lt.matches DESC, lt.prize DESC
  `);

  console.log('\n=== TICKETS CON 2+ ACIERTOS (lottery_tickets) ===');
  console.log(`Total tickets con premio: ${tickets.length}\n`);
  for (const t of tickets) {
    console.log(`  ${t.username} | ${t.matches} aciertos | Premio en ticket: ${t.prize} FXU | Nums: [${t.numbers}]`);
  }

  // 3. Check repeated players
  const { rows: repeats } = await c.query(`
    SELECT p.username, COUNT(*) as ticket_count, SUM(lw.prize) as total_won
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.draw_number = 2
    GROUP BY p.username
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);

  if (repeats.length > 0) {
    console.log('\n=== JUGADORES CON MÚLTIPLES TICKETS GANADORES ===');
    for (const r of repeats) {
      console.log(`  ${r.username}: ${r.ticket_count} tickets ganadores = ${r.total_won} FXU total`);
    }
  }

  // 4. Check if the FXU was actually added (look at the code logic)
  // The old execute_lottery_draw DID do UPDATE profiles SET fxu_balance = fxu_balance + prize
  // So tokens WERE credited. The bug was only that they weren't DEDUCTED from the jackpot.
  console.log('\n=== VERIFICACIÓN ===');
  console.log('La función anterior SÍ ejecutaba:');
  console.log('  UPDATE profiles SET fxu_balance = fxu_balance + v_prize_2match');
  console.log('Lo que NO hacía era descontar esos premios del jackpot acumulado.');

  await c.end();
})();
