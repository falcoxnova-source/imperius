const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  await c.query(`UPDATE plus_plans SET price_usdt = 3.5, price_fxu = 35000 WHERE code = 'plus_weekly'`);
  console.log('✅ Precio actualizado a $3.5 USDT / 35,000 FXU');

  const r = await c.query('SELECT id, name, code, duration_days, price_fxu, price_usdt, is_active FROM plus_plans ORDER BY price_usdt');
  console.table(r.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
