import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('=== TODOS los lottery_draws (sin filtro) ===');
const all = await c.query(`SELECT id, draw_number, status, opens_at, closes_at, drawn_at, total_tickets, total_pool, prize_pool, accumulated_jackpot, jackpot_winner_id, winning_numbers FROM lottery_draws ORDER BY draw_number`);
console.log(`TOTAL FILAS: ${all.rowCount}`);
console.table(all.rows);

console.log('\n=== TODOS los lottery_tickets ===');
const tickets = await c.query(`SELECT COUNT(*)::int AS total, MIN(created_at) AS first, MAX(created_at) AS last FROM lottery_tickets`);
console.table(tickets.rows);

const ticketsByDraw = await c.query(`SELECT draw_id, COUNT(*)::int AS tickets FROM lottery_tickets GROUP BY draw_id`);
console.log('Tickets por draw_id:');
console.table(ticketsByDraw.rows);

console.log('\n=== Secuencia draw_number ===');
const seq = await c.query(`SELECT last_value, is_called FROM lottery_draws_draw_number_seq`);
console.table(seq.rows);

console.log('\n=== Tablas relacionadas con lottery ===');
const tabs = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ILIKE '%lott%' ORDER BY table_name`);
console.table(tabs.rows);

console.log('\n=== Backup tables ===');
const bk = await c.query(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%lottery%' OR table_name ILIKE '%backup%' ORDER BY table_schema, table_name`);
console.table(bk.rows);

await c.end();
