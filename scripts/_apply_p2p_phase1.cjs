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

const files = [
  'supabase/migrations/20260420_p2p_marketplace_schema.sql',
  'supabase/migrations/20260420_p2p_marketplace_functions.sql',
  'supabase/migrations/20260420_p2p_payment_methods_seed.sql',
];

(async () => {
  const c = new Client(cfg);
  await c.connect();
  try {
    for (const f of files) {
      const full = path.resolve(process.cwd(), f);
      const sql = fs.readFileSync(full, 'utf8');
      console.log(`\n▶ Aplicando: ${f}`);
      await c.query(sql);
      console.log('✅ OK');
    }

    const chk = await c.query(`
      SELECT code, name, country_code, currency_code, is_enabled
      FROM p2p_payment_methods
      ORDER BY sort_order, id
    `);

    console.log('\nMétodos registrados:');
    chk.rows.forEach(r => {
      console.log(`  ${r.code} | ${r.currency_code} | country=${r.country_code || 'GLOBAL'} | enabled=${r.is_enabled}`);
    });

    console.log('\n🎉 P2P Fase 1 aplicada correctamente.');
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error('❌ Error aplicando P2P Fase 1:', e.message);
  process.exit(1);
});
