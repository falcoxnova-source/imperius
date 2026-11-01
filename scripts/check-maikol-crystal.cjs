const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Buscar usuario MAIKOL
  const user = await c.query(
    `SELECT id, username FROM profiles WHERE UPPER(username) LIKE '%MAIKOL%'`
  );
  console.log('=== USUARIO MAIKOL ===');
  user.rows.forEach(r => console.log(`  ID: ${r.id} | Username: ${r.username}`));

  if (user.rows.length === 0) {
    console.log('No se encontró usuario MAIKOL');
    await c.end();
    return;
  }

  const uid = user.rows[0].id;

  // Compras de crystal en el mercado hoy (3 abril 2026)
  const res = await c.query(`
    SELECT 
      mt.id,
      mt.buyer_id,
      mt.seller_id,
      mt.resource_type,
      mt.quantity,
      mt.price_per_unit,
      mt.total_price,
      mt.created_at,
      seller.username as seller_name,
      buyer.username as buyer_name
    FROM market_transactions mt
    LEFT JOIN profiles seller ON seller.id = mt.seller_id
    LEFT JOIN profiles buyer ON buyer.id = mt.buyer_id
    WHERE mt.buyer_id = $1
      AND LOWER(mt.resource_type) = 'crystal'
      AND mt.created_at >= '2026-04-03 00:00:00+00'
      AND mt.created_at < '2026-04-04 00:00:00+00'
    ORDER BY mt.created_at DESC
  `, [uid]);

  console.log(`\n=== COMPRAS DE CRYSTAL DE ${user.rows[0].username} HOY (3 Abril 2026) ===`);
  console.log(`Total transacciones: ${res.rows.length}\n`);

  let totalCrystal = 0;
  let totalUSDT = 0;
  const sellers = {};

  res.rows.forEach((r, i) => {
    const qty = Number(r.quantity);
    const total = Number(r.total_price);
    totalCrystal += qty;
    totalUSDT += total;

    if (!sellers[r.seller_name]) {
      sellers[r.seller_name] = { count: 0, crystal: 0, usdt: 0 };
    }
    sellers[r.seller_name].count++;
    sellers[r.seller_name].crystal += qty;
    sellers[r.seller_name].usdt += total;

    console.log(`  ${i + 1}. Vendedor: ${r.seller_name}`);
    console.log(`     Crystal: ${qty.toLocaleString()} | Precio/u: ${r.price_per_unit} | Total: ${total} USDT`);
    console.log(`     Hora: ${r.created_at}`);
    console.log('');
  });

  console.log('=== RESUMEN POR VENDEDOR ===\n');
  Object.entries(sellers).forEach(([name, data]) => {
    console.log(`  ${name}: ${data.count} compra(s) | ${data.crystal.toLocaleString()} crystal | ${data.usdt.toFixed(2)} USDT`);
  });

  console.log(`\n=== TOTALES ===`);
  console.log(`  Crystal total comprado: ${totalCrystal.toLocaleString()}`);
  console.log(`  USDT total gastado: ${totalUSDT.toFixed(2)}`);

  await c.end();
})();
