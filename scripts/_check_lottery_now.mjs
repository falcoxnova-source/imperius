import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
await c.connect();

console.log('=== lottery_draws ===');
const draws = await c.query(`SELECT id, draw_number, status, opens_at, closes_at, total_tickets, prize_pool, accumulated_jackpot FROM lottery_draws ORDER BY created_at DESC LIMIT 10`);
console.table(draws.rows);

console.log('\n=== get_lottery_info() (anon) ===');
await c.query(`SET ROLE anon`);
const a = await c.query(`SELECT get_lottery_info() AS info`);
console.log(JSON.stringify(a.rows[0].info, null, 2));
await c.query(`RESET ROLE`);

console.log('\n=== get_lottery_info() (authenticated as admin) ===');
await c.query(`SET ROLE authenticated`);
await c.query(`SET LOCAL request.jwt.claims = '{"sub":"fc82d77a-ce11-4a24-b7c3-0eaa0fa7a8d6","role":"authenticated"}'`);
try {
  const r = await c.query(`SELECT get_lottery_info() AS info`);
  console.log(JSON.stringify(r.rows[0].info, null, 2));
} catch (e) {
  console.log('ERROR:', e.message);
}
await c.query(`RESET ROLE`);

console.log('\n=== Funciones lottery ===');
const fns = await c.query(`
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname ILIKE '%lottery%'
  ORDER BY proname
`);
console.table(fns.rows);

await c.end();
