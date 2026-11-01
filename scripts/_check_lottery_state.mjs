import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await c.connect();

// 1) Estado de la loteria
console.log('=== LOTTERY DRAWS ===');
const draws = await c.query(`
  SELECT id, status, opens_at, closes_at, drawn_at, prize_pool, total_tickets, winning_numbers
  FROM lottery_draws
  ORDER BY opens_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 10
`).catch(e => ({ error: e.message }));
if (draws.error) {
  // probar columnas alternas
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='lottery_draws' ORDER BY ordinal_position`);
  console.log('lottery_draws columns:', cols.rows.map(r => r.column_name).join(', '));
} else {
  console.log('Total draws:', draws.rows.length);
  draws.rows.forEach((d, i) => console.log(`[${i+1}]`, JSON.stringify(d)));
}

console.log('\n=== LOTTERY TICKETS (last 7 days) ===');
const tickets = await c.query(`
  SELECT COUNT(*) as total, MIN(created_at) as first, MAX(created_at) as last
  FROM lottery_tickets
  WHERE created_at >= now() - interval '10 days'
`).catch(e => ({ error: e.message }));
if (tickets.error) console.log('Error:', tickets.error);
else console.log(tickets.rows[0]);

console.log('\n=== LOTTERY SETTINGS ===');
const settings = await c.query(`SELECT * FROM lottery_settings LIMIT 5`).catch(e => ({ error: e.message }));
if (settings.error) console.log('Error:', settings.error);
else settings.rows.forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== get_lottery_info() ===');
const info = await c.query('SELECT get_lottery_info()').catch(e => ({ error: e.message }));
if (info.error) console.log('Error:', info.error);
else console.log(JSON.stringify(info.rows[0]));

await c.end();
