const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  try {
    const pokId = 'c849d80a-dbd9-47de-b844-f5c34fe99801';
    const yirId = 'c73ee7e2-349c-42a6-a6a8-1684c41dbbee';

    // Perfiles
    console.log('\n=== PERFILES ===');
    const profs = await c.query(`
      SELECT id, username, email, fxu_balance, usdt_balance, created_at, is_banned
        FROM profiles WHERE id IN ($1, $2)
    `, [pokId, yirId]);
    console.log(JSON.stringify(profs.rows, null, 2));

    // Todas las órdenes P2P de Pokoyo
    console.log('\n=== TODAS LAS ÓRDENES P2P DE POKOYO ===');
    const ords = await c.query(`
      SELECT id, offer_id,
             CASE WHEN seller_id=$1 THEN 'vendedor' ELSE 'comprador' END AS rol,
             asset_amount, fiat_amount, fiat_currency, status,
             created_at, paid_at, released_at, cancelled_at, cancellation_reason
        FROM p2p_orders
       WHERE seller_id=$1 OR buyer_id=$1
       ORDER BY created_at DESC
    `, [pokId]);
    console.table(ords.rows);

    // Todas las ofertas de Pokoyo
    console.log('\n=== TODAS LAS OFERTAS DE POKOYO ===');
    const offs = await c.query(`
      SELECT id, side, asset, total_amount, available_amount, locked_amount,
             price_per_unit, fiat_currency, status, created_at
        FROM p2p_offers
       WHERE user_id=$1
       ORDER BY created_at DESC
    `, [pokId]);
    console.table(offs.rows);

    // Reputación Pokoyo
    console.log('\n=== REPUTACIÓN P2P DE POKOYO ===');
    const rep = await c.query(`
      SELECT * FROM p2p_user_reputation WHERE user_id=$1
    `, [pokId]).catch(() => null);
    if (rep) console.log(rep.rows);

    // Eventos / audit de la orden problemática
    const orderId = 'e7df0e50-9bd0-4507-ae57-516282df6c10';
    console.log('\n=== EVENTOS AUDIT DE LA ORDEN PROBLEMÁTICA ===');
    const ev = await c.query(`
      SELECT * FROM p2p_order_events WHERE order_id=$1 ORDER BY created_at
    `, [orderId]).catch(e => ({ err: e.message }));
    if (ev.err) console.log('(no hay tabla p2p_order_events:', ev.err, ')');
    else console.table(ev.rows);

    // Qué tablas P2P existen
    console.log('\n=== TABLAS P2P DISPONIBLES ===');
    const tabs = await c.query(`
      SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'p2p%'
      ORDER BY tablename
    `);
    console.log(tabs.rows.map(r => r.tablename).join('\n'));

  } finally { await c.end(); }
})();
