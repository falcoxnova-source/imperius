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

const file = 'supabase/migrations/20260422_p2p_functions_v3.sql';

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
      SELECT proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND proname IN ('p2p_accept_offer','p2p_release_order','p2p_cancel_offer','p2p_expire_order','p2p_admin_resolve_dispute')
      ORDER BY proname
    `);
    console.log('\nFunciones actualizadas:');
    console.table(rows);
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error('❌ Error aplicando P2P v3:', e.message);
  process.exit(1);
});
