const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Para cada usuario con usdt_balance > 0, calcular flujo USDT esperado:
  //   + sum(deposits confirmed)
  //   - sum(withdrawals confirmed)
  //   + sum(p2p USDT recibido)  (complejo, lo ignoramos, lo reportamos como "actividad p2p sí/no")
  //   + sum(referral_commissions USDT)
  // Un "fantasma" es un usuario con usdt_balance > 0 y 0 depósitos, 0 p2p USDT, 0 comisiones → origen inexplicable.

  const q = `
    WITH holders AS (
      SELECT id, username, email, usdt_balance, COALESCE(is_admin,false) AS is_admin, COALESCE(is_bot,false) AS is_bot
        FROM profiles
       WHERE usdt_balance > 0
    ),
    dep AS (
      SELECT user_id, SUM(amount)::numeric(30,8) AS total
        FROM wallet_transactions
       WHERE token_type='USDT' AND status='confirmed' AND tx_type='deposit'
       GROUP BY user_id
    ),
    wd AS (
      SELECT user_id, SUM(amount)::numeric(30,8) AS total
        FROM wallet_transactions
       WHERE token_type='USDT' AND status='confirmed' AND tx_type='withdrawal'
       GROUP BY user_id
    ),
    ref AS (
      SELECT referrer_id AS user_id, COUNT(*) AS n
        FROM referral_commissions
       GROUP BY referrer_id
    ),
    p2p_sell AS (
      -- PIPI-style: ¿tiene ofertas p2p con asset USDT?
      SELECT user_id, COUNT(*) AS n
        FROM p2p_offers
       WHERE asset='USDT'
       GROUP BY user_id
    )
    SELECT h.username, h.email, h.is_admin, h.is_bot, h.usdt_balance::numeric(20,8) AS usdt,
           COALESCE(dep.total,0) AS deposited,
           COALESCE(wd.total,0) AS withdrawn,
           COALESCE(ref.n,0) AS referrals,
           COALESCE(p2p_sell.n,0) AS p2p_usdt_offers
      FROM holders h
      LEFT JOIN dep ON dep.user_id=h.id
      LEFT JOIN wd ON wd.user_id=h.id
      LEFT JOIN ref ON ref.user_id=h.id
      LEFT JOIN p2p_sell ON p2p_sell.user_id=h.id
     ORDER BY h.usdt_balance DESC`;
  const r = await c.query(q);

  console.log('usuario | email | usdt | depositado | retirado | referidos | p2p_usdt_ofrts | VEREDICTO');
  console.log('-'.repeat(140));
  let phantoms = [];
  let sumPhantom = 0;
  for (const x of r.rows) {
    const dep = Number(x.deposited), wd = Number(x.withdrawn), ref = Number(x.referrals), bal = Number(x.usdt), p2p = Number(x.p2p_usdt_offers);
    const hasFlow = dep > 0 || wd > 0 || ref > 0 || p2p > 0;
    // Si saldo > 0 pero nunca depositó y no tiene actividad USDT explicable → fantasma
    const inexplicable = bal > 0 && dep === 0 && ref === 0 && p2p === 0;
    const tag = inexplicable ? '⚠ FANTASMA' : (bal > dep + ref + 1 ? '⚠ saldo>flujos' : 'ok');
    if (inexplicable) { phantoms.push(x); sumPhantom += bal; }
    console.log(`${(x.username||'-').substring(0,18).padEnd(18)} | ${(x.email||'-').substring(0,30).padEnd(30)} | ${String(bal).padStart(14)} | ${String(dep).padStart(10)} | ${String(wd).padStart(10)} | ${String(ref).padStart(6)} | ${String(p2p).padStart(3)} | ${x.is_admin?'ADM':''}${x.is_bot?'BOT':''} ${tag}`);
  }
  console.log('\n=== RESUMEN ===');
  console.log('Total holders USDT:', r.rows.length);
  console.log('Fantasmas (saldo sin depósito/comisión/p2p USDT):', phantoms.length);
  console.log('Suma USDT fantasma:', sumPhantom.toFixed(8));
  console.log('\n=== Lista de fantasmas ===');
  for (const p of phantoms) console.log(` • ${(p.username||'-').padEnd(20)} ${(p.email||'-').padEnd(35)} ${p.usdt} USDT`);

  await c.end();
})();
