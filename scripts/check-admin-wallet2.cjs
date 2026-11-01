const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const admin = await c.query(`
    SELECT id, username, fxu_balance, usdt_balance
    FROM profiles
    WHERE username ILIKE '%admin%'
    LIMIT 5
  `);
  for (const r of admin.rows) {
    console.log(`  ${r.username} (${r.id}): FXU=${r.fxu_balance}, USDT=${r.usdt_balance}`);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
