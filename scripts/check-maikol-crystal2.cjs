const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  const uid = '9fa72d04-58e4-4297-bcc3-11b136b42493'; // MAIKOL

  // Compras de crystal hoy (3 abril 2026 - hora del servidor puede ser UTC)
  const res = await c.query(`
    SELECT 
      mt.id,
      mt.buyer_id,
      mt.seller_id,
      mt.item_type,
      mt.item_code,
      mt.quantity,
      mt.total_price,
      mt.created_at,
      seller.username as seller_name
    FROM market_transactions mt
    LEFT JOIN profiles seller ON seller.id = mt.seller_id
    WHERE mt.buyer_id = $1
      AND LOWER(mt.item_code) = 'crystal'
      AND mt.created_at >= '2026-04-03 00:00:00+00'
      AND mt.created_at < '2026-04-04 23:59:59+00'
    ORDER BY mt.created_at DESC
  `, [uid]);

  console.log(`=== COMPRAS DE CRYSTAL DE MAIKOL HOY (3-4 Abril 2026 UTC) ===`);
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
      sellers[r.seller_name] = { id: r.seller_id, count: 0, crystal: 0, usdt: 0 };
    }
    sellers[r.seller_name].count++;
    sellers[r.seller_name].crystal += qty;
    sellers[r.seller_name].usdt += total;

    console.log(`  ${i + 1}. Vendedor: ${r.seller_name}`);
    console.log(`     Crystal: ${qty.toLocaleString()} | Total: ${total} USDT`);
    console.log(`     Hora: ${r.created_at}`);
    console.log('');
  });

  console.log('========================================');
  console.log('=== RESUMEN POR VENDEDOR ===\n');
  Object.entries(sellers).forEach(([name, data]) => {
    console.log(`  📌 ${name}`);
    console.log(`     ID: ${data.id}`);
    console.log(`     Compras: ${data.count} | Crystal: ${data.crystal.toLocaleString()} | USDT: ${data.usdt.toFixed(2)}`);
    console.log('');
  });

  console.log(`=== TOTALES ===`);
  console.log(`  💎 Crystal total comprado: ${totalCrystal.toLocaleString()}`);
  console.log(`  💰 USDT total gastado: ${totalUSDT.toFixed(2)}`);
  console.log(`  👥 Vendedores distintos: ${Object.keys(sellers).length}`);

  await c.end();
})();
