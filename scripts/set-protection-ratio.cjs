const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Before
  const before = await c.query("SELECT value FROM game_settings WHERE key = 'protection_ratio'");
  console.log('Before:', before.rows[0].value);

  // Update
  await c.query("UPDATE game_settings SET value = '2' WHERE key = 'protection_ratio'");

  // After
  const after = await c.query("SELECT value FROM game_settings WHERE key = 'protection_ratio'");
  console.log('After:', after.rows[0].value);

  console.log('\n✅ Protection ratio changed from 3:1 to 2:1');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
