import pg from 'pg';
const { Client } = pg;

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await c.connect();

// 1. Verifica que no haya draw abierto
const existing = await c.query(`SELECT id, draw_number, status FROM lottery_draws WHERE status = 'open' LIMIT 1`);
if (existing.rows.length > 0) {
  console.log('Ya existe sorteo abierto:', existing.rows[0]);
  await c.end();
  process.exit(0);
}

// 2. Acumulado del último completed sin jackpot_winner
const acc = await c.query(`
  SELECT COALESCE(accumulated_jackpot, 0) + COALESCE(prize_pool, 0) AS v
  FROM lottery_draws
  WHERE status = 'completed' AND jackpot_winner_id IS NULL
  ORDER BY drawn_at DESC LIMIT 1
`);
const accumulated = acc.rows[0]?.v ?? 0;

// 3. closes_at = próximo domingo 23:59 UTC
const closeRow = await c.query(`
  SELECT (date_trunc('week', now() + interval '1 day') + interval '6 days 23 hours 59 minutes')::timestamptz AS d
`);
const closes_at = closeRow.rows[0].d;

// 4. INSERT directo (replica exacta de create_lottery_draw)
const ins = await c.query(`
  INSERT INTO lottery_draws (status, opens_at, closes_at, accumulated_jackpot)
  VALUES ('open', now(), $1, $2)
  RETURNING id, draw_number, status, opens_at, closes_at, accumulated_jackpot
`, [closes_at, accumulated]);

console.log('✅ Sorteo creado:');
console.log(ins.rows[0]);

// 5. Refresh PostgREST cache
await c.query(`NOTIFY pgrst, 'reload schema'`);

// 6. Verifica con get_lottery_info
const info = await c.query(`SELECT get_lottery_info() AS info`);
console.log('\nget_lottery_info:', JSON.stringify(info.rows[0].info, null, 2));

await c.end();
