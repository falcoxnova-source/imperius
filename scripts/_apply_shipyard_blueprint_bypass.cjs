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
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260618310000_fix_shipyard_queue_blueprint_bypass.sql'),
    'utf8'
  );
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('OK: secure_add_to_shipyard_queue parcheado');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('FAIL:', e.message);
    process.exit(1);
  }
  await c.end();
})();
