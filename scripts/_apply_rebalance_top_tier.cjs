const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618280000_rebalance_top_tier_ship_costs.sql'), 'utf8');
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Rebalance applied');
    const r = await c.query(
      "SELECT code, metal_cost, crystal_cost, deuterium_cost, (metal_cost+crystal_cost+deuterium_cost) AS total, build_time_seconds FROM ship_types WHERE code IN ('mega_recycler','falco_x_clasica')"
    );
    console.table(r.rows);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✗', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
