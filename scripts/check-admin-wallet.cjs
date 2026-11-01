const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) Get admin user info and current wallet balance
  console.log('=== Admin wallet current state ===');
  const admin = await c.query(`
    SELECT p.id, p.username, p.fxu_balance, p.usdt_balance
    FROM profiles p
    WHERE p.username = 'admin' OR p.role = 'admin'
    ORDER BY p.role DESC, p.username
    LIMIT 5
  `);
  for (const r of admin.rows) {
    console.log(`  ${r.username} (${r.id}): FXU=${r.fxu_balance}, USDT=${r.usdt_balance}`);
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
