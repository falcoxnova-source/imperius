const fs = require('fs');
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260509b_flatter_curve.sql', 'utf8');
  try {
    await c.query('BEGIN');
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✅ Curva aplicada');

    // Simulación de reparto con un pool de 30400 FXU
    const r = await c.query(`
      WITH RECURSIVE r AS (
        SELECT 1::int AS rank, power(1.05, 49)::numeric AS w
        UNION ALL
        SELECT rank+1, power(1.05, 50-(rank+1)) FROM r WHERE rank < 50
      ),
      t AS (SELECT sum(w) AS tot FROM r)
      SELECT rank, round((w/tot)*100, 2) AS pct, floor(30400 * w/tot) AS fxu
      FROM r, t
      WHERE rank IN (1,2,3,5,10,20,30,40,50)
      ORDER BY rank
    `);
    console.log('\nSimulación con pool=30400 FXU:');
    r.rows.forEach(x => console.log(`  #${x.rank.toString().padStart(2)} → ${x.pct}%  = ${x.fxu} FXU`));
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
