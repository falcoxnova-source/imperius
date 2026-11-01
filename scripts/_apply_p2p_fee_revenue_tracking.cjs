#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CONN = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260428_p2p_fee_admin_revenue_tracking.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const c = new Client(CONN);
  await c.connect();
  console.log('✓ Connected');
  try {
    const r = await c.query(sql);
    console.log('✓ Migration applied');
    if (Array.isArray(r)) {
      r.forEach(x => x.command && console.log('  ·', x.command, x.rowCount ?? ''));
    }

    // Verificación
    const v = await c.query(`
      SELECT COUNT(*)::int AS total,
             SUM(CASE WHEN currency='FXU'  THEN amount ELSE 0 END) AS fxu_total,
             SUM(CASE WHEN currency='USDT' THEN amount ELSE 0 END) AS usdt_total
      FROM admin_revenue WHERE revenue_type='p2p_fee'
    `);
    console.log('\n=== admin_revenue (p2p_fee) ===');
    console.log(v.rows[0]);
  } catch (e) {
    console.error('✗ Error:', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
