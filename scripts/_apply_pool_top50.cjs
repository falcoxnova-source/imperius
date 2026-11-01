const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260509_ranking_top50_and_repercent.sql'), 'utf8');
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Migración aplicada');

    const r = await client.query('SELECT monthly_percent, destruction_percent, plus_percent, expedition_percent, monthly_balance FROM jackpot_pools WHERE id=1');
    console.log('Pools:', r.rows[0]);

    const check = await client.query(`
      SELECT prosrc LIKE '%TOP 50%' AS has_top50,
             prosrc LIKE '%LIMIT 50%' AS has_limit50,
             prosrc LIKE '%1.08%' AS has_108
        FROM pg_proc WHERE proname='admin_distribute_monthly_pool'
    `);
    console.log('Fn checks:', check.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
