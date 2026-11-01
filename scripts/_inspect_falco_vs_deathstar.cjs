process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='ship_types' ORDER BY ordinal_position");
  console.log('COLS:', cols.rows.map(r=>r.column_name).join(', '));
  const r = await c.query("SELECT * FROM ship_types WHERE code IN ('falco_x_clasica','deathstar') ORDER BY code");
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
})();
