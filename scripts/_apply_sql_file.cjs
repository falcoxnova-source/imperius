const pg = require('pg');
const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node _apply_sql_file.cjs <path>');
  process.exit(1);
}

const sql = fs.readFileSync(file, 'utf8');
const c = new pg.Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(sql);
    await c.query('COMMIT');
    console.log('OK applied:', path.basename(file));
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('FAILED:', e.message);
    process.exit(2);
  } finally {
    await c.end();
  }
})();
