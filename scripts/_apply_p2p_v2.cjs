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
  'supabase/migrations/20260421_p2p_fee_settings.sql',
  'supabase/migrations/20260421_p2p_functions_v2.sql',
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

    const { rows } = await c.query(`
      SELECT key, value
      FROM game_settings
      WHERE key IN (
        'p2p_fee_percent','p2p_fee_admin_share','p2p_fee_referrer_share','p2p_fee_pool_share'
      )
      ORDER BY key
    `);

    console.log('\nConfiguración P2P fee:');
    rows.forEach(r => console.log(`  ${r.key} = ${r.value}`));

    console.log('\n🎉 P2P v2 aplicada correctamente.');
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error('❌ Error aplicando P2P v2:', e.message);
  process.exit(1);
});
