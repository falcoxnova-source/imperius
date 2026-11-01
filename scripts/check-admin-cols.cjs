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

  // Get admin_revenue columns
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='admin_revenue' ORDER BY ordinal_position");
  console.log('admin_revenue columns:', cols.rows.map(x => x.column_name).join(', '));

  // Get all Plus/VIP purchases
  const r3 = await c.query(`
    SELECT ar.* FROM admin_revenue ar
    WHERE ar.revenue_type LIKE '%Plus%' OR ar.revenue_type LIKE '%VIP%'
    ORDER BY ar.created_at DESC
    LIMIT 5
  `);
  if (r3.rows.length > 0) {
    console.log('\nSample row keys:', Object.keys(r3.rows[0]).join(', '));
    console.log('\nRecent Plus/VIP purchases:');
    for (const row of r3.rows) {
      console.log(' ', JSON.stringify(row));
    }
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
