const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  try {
    // 1. Ofertas de 3000 FXU recientes
    console.log('\n=== OFERTAS con 3000 FXU (últimas 48h) ===');
    const offers = await c.query(`
      SELECT o.id, p.username, o.side, o.asset, o.total_amount, o.available_amount, o.locked_amount,
             o.price_per_unit, o.fiat_currency, o.status, o.created_at, o.expires_at
        FROM p2p_offers o
        JOIN profiles p ON p.id = o.user_id
       WHERE o.total_amount = 3000
         AND o.created_at > now() - interval '48 hours'
       ORDER BY o.created_at DESC
    `);
    console.table(offers.rows);

    // 2. Órdenes relacionadas con esas ofertas
    if (offers.rows.length > 0) {
      const ids = offers.rows.map(r => `'${r.id}'`).join(',');
      console.log('\n=== ÓRDENES ligadas ===');
      const ords = await c.query(`
        SELECT ord.id, ord.offer_id, sp.username as seller, bp.username as buyer,
               ord.asset_amount, ord.fiat_amount, ord.fiat_currency, ord.status,
               ord.created_at, ord.paid_at, ord.released_at, ord.cancelled_at
          FROM p2p_orders ord
          JOIN profiles sp ON sp.id = ord.seller_id
          JOIN profiles bp ON bp.id = ord.buyer_id
         WHERE ord.offer_id IN (${ids})
         ORDER BY ord.created_at DESC
      `);
      console.table(ords.rows);
    }

    // 3. Ofertas activas con saldo móvil ~390
    console.log('\n=== Ofertas SELL con price * amount ~ 390 (48h) ===');
    const around = await c.query(`
      SELECT o.id, p.username, o.side, o.asset, o.total_amount, o.available_amount,
             o.price_per_unit, (o.total_amount * o.price_per_unit) as total_fiat,
             o.fiat_currency, o.status, o.created_at
        FROM p2p_offers o
        JOIN profiles p ON p.id = o.user_id
       WHERE o.side='sell'
         AND (o.total_amount * o.price_per_unit) BETWEEN 380 AND 400
         AND o.created_at > now() - interval '48 hours'
       ORDER BY o.created_at DESC
       LIMIT 10
    `);
    console.table(around.rows);

  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await c.end();
  }
})();
