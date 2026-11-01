const { Client } = require('pg');
const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};
(async () => {
  const c = new Client(cfg); await c.connect();
  try {
    await c.query(`
      UPDATE p2p_payment_methods
      SET currency_code = 'USD',
          country_code = 'CU',
          name = 'Tarjeta Clásica (USD)',
          notes = 'Tarjeta Clásica Cuba — cobra en USD'
      WHERE code = 'cu_tarjeta_clasica'
    `);
    const r = await c.query(`SELECT code,name,country_code,currency_code,is_enabled FROM p2p_payment_methods WHERE code='cu_tarjeta_clasica'`);
    console.table(r.rows);
    console.log('✅ Tarjeta Clásica actualizada a USD');
  } finally { await c.end(); }
})();
