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

  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260505_p2p_phase11_timeouts_24h.sql');
  const sql = fs.readFileSync(file, 'utf8');

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Migration applied: phase11');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  const check = await c.query(`
    SELECT
      pg_get_constraintdef(c.oid) AS time_limit_check
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'p2p_offers'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%time_limit_minutes%'
    LIMIT 1
  `);

  console.log('constraint:', check.rows[0]?.time_limit_check || 'not found');

  await c.end();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
