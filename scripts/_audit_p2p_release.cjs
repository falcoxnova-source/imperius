const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 1) Ver la definición actual de p2p_release_order
  const def = await c.query(`SELECT pg_get_functiondef(oid) AS src FROM pg_proc WHERE proname='p2p_release_order'`);
  console.log('=== p2p_release_order EN VIVO ===');
  if (def.rows.length) console.log(def.rows[0].src); else console.log('no existe');

  // 2) Estructura y monedas reales en p2p_orders
  const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='p2p_orders' ORDER BY ordinal_position`);
  console.log('\n=== p2p_orders cols ===');
  for (const r of cols.rows) console.log(' ', r.column_name, r.data_type);

  // 3) Órdenes recientes (últimas 30) con asset/fiat/estado
  const q = await c.query(`
    SELECT id, asset, fiat_currency, asset_amount, fiat_amount, fee_asset, status, created_at, released_at, seller_id, buyer_id
      FROM p2p_orders
     ORDER BY created_at DESC LIMIT 40`);
  console.log('\n=== Últimas 40 órdenes ===');
  for (const r of q.rows) console.log(r);

  // 4) Ventas de FXU con fiat externo (USD/CUP/etc) que se liberaron
  const extern = await c.query(`
    SELECT o.id, o.asset, o.fiat_currency, o.asset_amount, o.fiat_amount, o.status, o.released_at,
           sp.username AS seller, sp.usdt_balance AS seller_usdt,
           bp.username AS buyer,  bp.usdt_balance AS buyer_usdt
      FROM p2p_orders o
      JOIN profiles sp ON sp.id=o.seller_id
      JOIN profiles bp ON bp.id=o.buyer_id
     WHERE o.asset='FXU'
       AND upper(o.fiat_currency) NOT IN ('FXU','USDT')
       AND o.status='released'
     ORDER BY o.released_at DESC LIMIT 30`);
  console.log('\n=== Ventas FXU por fiat EXTERNO ya liberadas ===');
  console.log('n=', extern.rows.length);
  for (const r of extern.rows) console.log(r);

  await c.end();
})();
