const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await c.connect();

  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260618260000_adjust_blueprint_ship_requirements.sql');
  const sql = fs.readFileSync(file, 'utf8');

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Requirements adjusted (mega_recycler + falco_x_clasica)');

    const { rows } = await c.query(
      `SELECT st.code, sr.required_building_id, sr.required_building_level, sr.required_tech_id, sr.required_tech_level
       FROM ship_requirements sr
       JOIN ship_types st ON st.id = sr.ship_type_id
       WHERE st.code IN ('mega_recycler', 'falco_x_clasica')
       ORDER BY st.code, sr.id`
    );
    console.table(rows);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✗ Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
