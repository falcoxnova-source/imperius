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

  // Get all distinct revenue types
  const r1 = await c.query("SELECT DISTINCT revenue_type, COUNT(*) as cnt FROM admin_revenue GROUP BY revenue_type ORDER BY revenue_type");
  console.log('All revenue types:');
  for (const row of r1.rows) {
    console.log(`  ${row.revenue_type}: ${row.cnt}`);
  }

  // Get recent admin_revenue entries
  const r2 = await c.query("SELECT * FROM admin_revenue ORDER BY created_at DESC LIMIT 10");
  console.log('\nRecent 10 admin_revenue entries:');
  for (const row of r2.rows) {
    console.log(`  ${row.created_at} | ${row.revenue_type} | amt:${row.amount} | ${row.description} | user:${row.related_user_id}`);
  }

  // Check plus_subscriptions table
  const r3 = await c.query("SELECT * FROM plus_subscriptions ORDER BY created_at DESC LIMIT 10");
  console.log('\nRecent 10 plus_subscriptions:');
  for (const row of r3.rows) {
    console.log(`  ${JSON.stringify(row)}`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
