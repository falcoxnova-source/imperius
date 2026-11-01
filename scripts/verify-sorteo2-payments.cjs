const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Check all Sorteo #2 winners and verify fxu_balance was updated
  const r = await c.query(`
    SELECT p.username, p.fxu_balance, lw.prize, lw.matches, lw.numbers, lw.winning_numbers,
           lw.created_at as win_date
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.draw_number = 2
    ORDER BY p.username
  `);

  console.log('=== SORTEO #2 - TODOS LOS GANADORES ===');
  console.log(`Total ganadores: ${r.rows.length}`);
  console.log('');
  
  let totalPaid = 0;
  r.rows.forEach(w => {
    totalPaid += parseFloat(w.prize);
    console.log(`${w.username} | premio=${w.prize} FXU | matches=${w.matches} | balance_actual=${parseFloat(w.fxu_balance).toFixed(2)} FXU | nums=${JSON.stringify(w.numbers)} | ganadores=${JSON.stringify(w.winning_numbers)}`);
  });
  
  console.log(`\nTotal pagado en premios: ${totalPaid} FXU`);

  // Now check the audit trail - look at profiles update history via lottery_tickets
  const r2 = await c.query(`
    SELECT p.username, lt.prize as ticket_prize, lt.matches as ticket_matches
    FROM lottery_tickets lt
    JOIN profiles p ON p.id = lt.user_id
    JOIN lottery_draws ld ON ld.id = lt.draw_id
    WHERE ld.draw_number = 2 AND lt.matches >= 2
    ORDER BY p.username
  `);

  console.log('\n=== SORTEO #2 - TICKETS GANADORES (lottery_tickets) ===');
  r2.rows.forEach(t => {
    console.log(`${t.username} | prize_in_ticket=${t.ticket_prize} | matches=${t.ticket_matches}`);
  });

  // Cross-check: any winner whose prize is NULL or 0 in lottery_tickets?
  const r3 = await c.query(`
    SELECT p.username, lt.prize, lt.matches
    FROM lottery_tickets lt
    JOIN profiles p ON p.id = lt.user_id
    JOIN lottery_draws ld ON ld.id = lt.draw_id
    WHERE ld.draw_number = 2 AND lt.matches >= 2 AND (lt.prize IS NULL OR lt.prize = 0)
  `);

  if (r3.rows.length > 0) {
    console.log('\n⚠️ TICKETS GANADORES SIN PREMIO REGISTRADO:');
    r3.rows.forEach(t => console.log(`${t.username} | prize=${t.prize} | matches=${t.matches}`));
  } else {
    console.log('\n✅ Todos los tickets ganadores tienen premio registrado');
  }

  await c.end();
})();
