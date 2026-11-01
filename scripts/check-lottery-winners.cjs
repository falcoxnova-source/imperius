const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();

  // Get latest completed draws
  const { rows: draws } = await c.query(`
    SELECT ld.id, ld.draw_number, ld.status, ld.winning_numbers, 
           ld.total_tickets, ld.total_pool, ld.prize_pool,
           ld.jackpot_amount, ld.accumulated_jackpot,
           ld.drawn_at, ld.closes_at,
           p.username as jackpot_winner_name
    FROM lottery_draws ld
    LEFT JOIN profiles p ON p.id = ld.jackpot_winner_id
    ORDER BY ld.draw_number DESC
    LIMIT 5
  `);

  console.log('=== ÚLTIMOS 5 SORTEOS ===\n');
  for (const d of draws) {
    console.log(`Sorteo #${d.draw_number} | Status: ${d.status} | Cierre: ${d.closes_at}`);
    console.log(`  Números ganadores: ${d.winning_numbers || 'N/A'}`);
    console.log(`  Tickets: ${d.total_tickets} | Pool: ${d.total_pool} FXU`);
    console.log(`  Jackpot ganador: ${d.jackpot_winner_name || 'Ninguno'} (${d.jackpot_amount || 0} FXU)`);
    console.log(`  Acumulado: ${d.accumulated_jackpot} FXU`);
    console.log('');
  }

  // Get winners from the latest completed draw
  const { rows: winners } = await c.query(`
    SELECT lw.matches, lw.prize, lw.numbers, lw.winning_numbers,
           p.username, lw.created_at
    FROM lottery_winners lw
    JOIN profiles p ON p.id = lw.user_id
    JOIN lottery_draws ld ON ld.id = lw.draw_id
    WHERE ld.status = 'completed'
    ORDER BY ld.draw_number DESC, lw.matches DESC, lw.prize DESC
    LIMIT 50
  `);

  if (winners.length > 0) {
    console.log('=== GANADORES DEL ÚLTIMO SORTEO ===\n');
    for (const w of winners) {
      console.log(`  🏆 ${w.username} | ${w.matches} aciertos | Premio: ${w.prize} FXU | Números: [${w.numbers}] vs [${w.winning_numbers}]`);
    }
  } else {
    console.log('=== NO HAY GANADORES REGISTRADOS ===');
    
    // Check if there are any tickets with matches
    const { rows: tickets } = await c.query(`
      SELECT lt.matches, lt.prize, lt.numbers, p.username
      FROM lottery_tickets lt
      JOIN profiles p ON p.id = lt.user_id
      JOIN lottery_draws ld ON ld.id = lt.draw_id
      WHERE ld.status = 'completed'
        AND lt.matches >= 2
      ORDER BY ld.draw_number DESC, lt.matches DESC
      LIMIT 20
    `);
    
    if (tickets.length > 0) {
      console.log('\nTickets con aciertos (del lottery_tickets):');
      for (const t of tickets) {
        console.log(`  ${t.username} | ${t.matches} aciertos | Premio: ${t.prize} FXU | Números: [${t.numbers}]`);
      }
    } else {
      console.log('\nNingún ticket tuvo 2+ aciertos en sorteos completados.');
    }
  }

  await c.end();
}

run().catch(console.error);
