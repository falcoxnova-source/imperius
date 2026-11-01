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

  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260618250000_mega_recycler_and_blueprints_system.sql');
  const sql = fs.readFileSync(file, 'utf8');

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Migration applied: mega_recycler + blueprints');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✗ Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
