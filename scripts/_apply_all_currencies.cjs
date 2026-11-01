const { Client } = require('pg');
const fs = require('fs');

const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const sql = fs.readFileSync('supabase/migrations/20260423_p2p_all_world_currencies.sql', 'utf8');
  const c = new Client(cfg);
  await c.connect();
  try {
    await c.query(sql);
    const { rows } = await c.query(`
      SELECT COUNT(DISTINCT currency_code) AS currencies, COUNT(*) AS methods
      FROM p2p_payment_methods WHERE is_enabled=true
    `);
    console.log('✅ Migración aplicada.');
    console.log(`Monedas distintas habilitadas: ${rows[0].currencies}`);
    console.log(`Métodos habilitados totales: ${rows[0].methods}`);
    const sample = await c.query(`
      SELECT currency_code, COUNT(*) n FROM p2p_payment_methods
      WHERE is_enabled=true GROUP BY currency_code ORDER BY currency_code LIMIT 20
    `);
    console.table(sample.rows);
  } catch (e) {
    console.error('❌', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
