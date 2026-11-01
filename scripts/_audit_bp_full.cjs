const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('\n== Listings activos de blueprint (escrow) ==');
  const lst = await c.query(`
    SELECT ml.id, p.username AS seller, ml.item_code, ml.total_price, ml.status, ml.created_at
    FROM market_listings ml
    LEFT JOIN profiles p ON p.id = ml.seller_id
    WHERE ml.listing_type = 'blueprint'
    ORDER BY ml.created_at DESC
    LIMIT 20
  `);
  console.table(lst.rows);

  console.log('\n== Escrow rows pendientes ==');
  const esc = await c.query(`
    SELECT bme.listing_id, p.username AS seller, sb.code AS bp_code, bme.delivered_at, bme.returned_at
    FROM blueprint_market_escrow bme
    LEFT JOIN profiles p ON p.id = bme.seller_id
    LEFT JOIN ship_blueprints sb ON sb.id = bme.blueprint_id
    ORDER BY bme.created_at DESC
    LIMIT 20
  `);
  console.table(esc.rows);

  console.log('\n== user_ship_blueprints (filas crudas) ==');
  const raw = await c.query(`
    SELECT usb.id, p.username, sb.code, usb.source, usb.acquired_at
    FROM user_ship_blueprints usb
    JOIN ship_blueprints sb ON sb.id = usb.blueprint_id
    LEFT JOIN profiles p ON p.id = usb.user_id
    ORDER BY usb.acquired_at DESC
    LIMIT 30
  `);
  console.table(raw.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
