const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Ver columnas de market_transactions
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'market_transactions' 
    ORDER BY ordinal_position
  `);
  console.log('=== COLUMNAS DE market_transactions ===');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // Ver columnas de market_listings
  const cols2 = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'market_listings' 
    ORDER BY ordinal_position
  `);
  console.log('\n=== COLUMNAS DE market_listings ===');
  cols2.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));

  // Ver un ejemplo de transacción reciente
  const sample = await c.query(`
    SELECT * FROM market_transactions ORDER BY created_at DESC LIMIT 3
  `);
  console.log('\n=== EJEMPLO TRANSACCIONES RECIENTES ===');
  sample.rows.forEach(r => console.log(r));

  await c.end();
})();
