const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const u = await c.query(`SELECT id, email, username, usdt_balance, fxu_balance, is_admin, is_bot, created_at FROM profiles WHERE email='dark@gmail.com' OR username='PIPI'`);
  console.log('=== Cuenta PIPI ===');
  console.log(u.rows);

  if (u.rows.length === 0) { await c.end(); return; }
  const uid = u.rows[0].id;

  // Historial wallet_transactions
  const wt = await c.query(`SELECT created_at, tx_type, token_type, status, amount, fxu_amount, tx_hash, wallet_address, error_message FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at`, [uid]);
  console.log('\n=== wallet_transactions de PIPI ===');
  for (const r of wt.rows) console.log(r);

  // ¿Alguna tabla de auditoría?
  const tbls = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%audit%' OR table_name ILIKE '%admin_log%' OR table_name ILIKE '%balance%' OR table_name ILIKE '%adjust%') ORDER BY table_name`);
  console.log('\n=== tablas audit/balance/adjust ===');
  for (const r of tbls.rows) console.log(' ', r.table_name);

  await c.end();
})();
