const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260427170000_capital_blueprints_purchaseable_no_drops.sql');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  console.log('Applying migration:', path.basename(SQL_FILE));
  await client.query(sql);
  console.log('✅ Migration applied successfully.');

  const check = await client.query(`
    SELECT code, name, price_fxu, is_active, COALESCE(is_droppable, true) AS is_droppable
    FROM ship_blueprints
    WHERE code IN ('bp_deathstar', 'bp_falco_x_clasica', 'bp_nova', 'bp_nodra', 'bp_mega_recycler')
    ORDER BY code
  `);
  console.table(check.rows);

  await client.end();
})().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
