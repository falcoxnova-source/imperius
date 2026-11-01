const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Top 20 USDT con balance actual
  const top = await c.query(`
    SELECT email, username, usdt_balance
      FROM profiles
     WHERE usdt_balance > 0 AND COALESCE(is_admin,false)=false
     ORDER BY usdt_balance DESC LIMIT 20`);
  console.log('=== TOP 20 USDT HOY (excluye admin) ===');
  let i = 1;
  for (const r of top.rows) console.log(`${String(i++).padStart(2)} | ${String(r.usdt_balance).padStart(12)} | ${(r.username||'-').substring(0,20).padEnd(20)} | ${r.email}`);

  // ¿Cuántos usuarios y cuánto se acumuló en las últimas 48h?
  // Ver transacciones de las últimas 48h que afectan usdt_balance
  const recent = await c.query(`
    SELECT tx_type, status, token_type, COUNT(*) AS n,
           SUM(amount)::numeric(20,4) AS total_amount
      FROM wallet_transactions
     WHERE created_at > now() - interval '48 hours'
     GROUP BY tx_type, status, token_type
     ORDER BY tx_type, status`);
  console.log('\n=== Transacciones últimas 48h ===');
  for (const r of recent.rows) console.log(r);

  // Ver si hay ledger / fxu_transactions para entender flujos
  const tbls = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%fxu%' OR table_name ILIKE '%swap%' OR table_name ILIKE '%deposit%' OR table_name ILIKE '%ledger%' OR table_name ILIKE '%history%') ORDER BY table_name`);
  console.log('\n=== tablas swap/deposit/ledger ===');
  for (const r of tbls.rows) console.log(' ', r.table_name);

  // Buscar deposits o swaps recientes que hayan incrementado usdt_balance
  const swapCandidates = ['wallet_transactions','swap_history','fxu_swaps','usdt_swaps'];
  for (const t of swapCandidates) {
    const ex = await c.query(`SELECT to_regclass($1) AS r`, ['public.' + t]);
    if (ex.rows[0].r) {
      const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [t]);
      console.log(`\n[${t}] cols:`, cols.rows.map(x => x.column_name).join(', '));
    }
  }

  // Tipos de transacción distintos y totales USDT
  const types = await c.query(`
    SELECT tx_type, COUNT(*) AS n, SUM(amount)::numeric(20,4) AS total
      FROM wallet_transactions
     WHERE token_type='USDT' AND status='confirmed'
     GROUP BY tx_type ORDER BY tx_type`);
  console.log('\n=== Histórico USDT por tx_type (confirmadas) ===');
  for (const r of types.rows) console.log(r);

  // Ver si hay campo de USDT en swaps a través de wallet_transactions con tx_type swap
  const swapTxs = await c.query(`
    SELECT tx_type, token_type, COUNT(*) AS n, SUM(amount)::numeric(20,4) AS amount, SUM(fxu_amount)::numeric(20,4) AS fxu
      FROM wallet_transactions
     WHERE created_at > now() - interval '7 days'
     GROUP BY tx_type, token_type ORDER BY tx_type, token_type`);
  console.log('\n=== Últimos 7 días por tipo/token ===');
  for (const r of swapTxs.rows) console.log(r);

  await c.end();
})();
