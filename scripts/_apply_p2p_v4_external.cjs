const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

const file = 'supabase/migrations/20260422_p2p_functions_v4_external_fiat.sql';

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    const full = path.resolve(process.cwd(), file);
    const sql = fs.readFileSync(full, 'utf8');
    console.log(`▶ Aplicando: ${file}`);
    await c.query(sql);
    console.log('✅ OK');

    const { rows } = await c.query(`
      SELECT code, currency_code, is_enabled
      FROM p2p_payment_methods
      WHERE code IN ('cu_cup_transfer', 'cu_mlc', 'cu_saldomovil', 'internal_fxu', 'internal_usdt')
      ORDER BY sort_order
    `);
    console.log('\nMétodos clave:');
    console.table(rows);
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error('❌ Error aplicando P2P v4:', e.message);
  process.exit(1);
});
