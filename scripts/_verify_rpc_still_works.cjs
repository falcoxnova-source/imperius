const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });

// Verifica que una RPC SECURITY DEFINER (como swap_fxu_to_usdt) aún pueda
// modificar profiles.usdt_balance / fxu_balance a través del trigger nuevo.
(async () => {
  await c.connect();

  // Tomar un usuario con fxu_balance > 0 para no romper nada (usamos ROLLBACK)
  const u = await c.query(`
    SELECT id, username, fxu_balance, usdt_balance
    FROM profiles
    WHERE is_admin = false AND is_bot = false AND fxu_balance >= 1000
    LIMIT 1`);
  if (!u.rows.length) { console.log('No hay usuarios de prueba'); process.exit(0); }
  const p = u.rows[0];
  console.log(`Sujeto: ${p.username} fxu=${p.fxu_balance} usdt=${p.usdt_balance}\n`);

  await c.query('BEGIN');
  await c.query(`SET LOCAL ROLE authenticated`);
  await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [p.id]);

  // 1) Llamar a swap_fxu_to_usdt(1) — debe funcionar y modificar ambos balances
  console.log('1) Llamando a swap_fxu_to_usdt(1000)...');
  try {
    const r = await c.query(`SELECT swap_fxu_to_usdt(1000::numeric) AS result`);
    console.log('   ✅ RPC exitosa:', JSON.stringify(r.rows[0].result));
  } catch (e) {
    console.log('   ❌ RPC ROTA:', e.message);
  }

  // 2) Ver si los balances cambiaron dentro de la tx
  const after = await c.query(`SELECT fxu_balance, usdt_balance FROM profiles WHERE id=$1`, [p.id]);
  console.log(`   Balances post-swap (en tx): fxu=${after.rows[0].fxu_balance} usdt=${after.rows[0].usdt_balance}`);

  await c.query('ROLLBACK');
  console.log('\n(transacción revertida — nada persistido)');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
