const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});
(async () => {
  await c.connect();
  
  // Check admin_revenue columns
  const r = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='admin_revenue' ORDER BY ordinal_position");
  console.log('=== admin_revenue columns ===');
  r.rows.forEach(x => console.log(x.column_name, '(' + x.data_type + ')'));
  
  await c.end();
})();
