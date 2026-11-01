const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Top accounts that have withdrawn USDT (confirmed only)
  const r = await c.query(`
    SELECT pr.email,
           pr.username,
           COUNT(*)              AS withdrawals,
           SUM(wt.amount)::numeric(20,4)   AS total_usdt_received,
           SUM(wt.fxu_amount)::numeric(20,4) AS total_fxu_spent,
           MIN(wt.created_at)    AS first_withdrawal,
           MAX(wt.created_at)    AS last_withdrawal
      FROM wallet_transactions wt
      JOIN profiles pr ON pr.id = wt.user_id
     WHERE wt.tx_type = 'withdrawal'
       AND wt.token_type = 'USDT'
       AND wt.status = 'confirmed'
     GROUP BY pr.email, pr.username
     ORDER BY total_usdt_received DESC NULLS LAST
     LIMIT 25`);

  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        TOP CUENTAS POR USDT RETIRADO (tx_type=withdrawal, confirmed)          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  # | USDT recibido |  FXU gastado  | #retiros | username / email');
  console.log('----+---------------+---------------+----------+------------------------------------');
  let i = 1;
  let total = 0;
  for (const row of r.rows) {
    total += Number(row.total_usdt_received);
    const u = (row.username || '-').toString().padEnd(14).substring(0, 14);
    console.log(`${String(i).padStart(3)} | ${String(row.total_usdt_received).padStart(13)} | ${String(row.total_fxu_spent).padStart(13)} | ${String(row.withdrawals).padStart(8)} | ${u} | ${row.email}`);
    i++;
  }

  // Totals
  const tot = await c.query(`
    SELECT COUNT(*) AS n, SUM(amount)::numeric(20,4) AS total_usdt, SUM(fxu_amount)::numeric(20,4) AS total_fxu,
           COUNT(DISTINCT user_id) AS unique_users
      FROM wallet_transactions
     WHERE tx_type='withdrawal' AND token_type='USDT' AND status='confirmed'`);
  console.log('\nGLOBAL:', tot.rows[0]);

  await c.end();
})();
