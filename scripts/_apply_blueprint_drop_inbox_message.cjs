const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260427160000_blueprint_drop_inbox_message.sql');

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

  // Quick smoke test: ensure function exists and has the new INSERT INTO messages
  const { rows } = await client.query(`
    SELECT pg_get_functiondef(oid) AS def
    FROM pg_proc
    WHERE proname = 'award_expedition_blueprint_drop'
  `);
  const def = rows[0]?.def || '';
  const hasMessage = def.includes('Sonda Exploradora') && def.includes('INSERT INTO messages');
  console.log('Function contains inbox message logic:', hasMessage ? '✅' : '❌');

  await client.end();
})().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
