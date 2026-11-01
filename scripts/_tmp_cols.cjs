const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  try {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='p2p_offers' ORDER BY ordinal_position`);
    console.log('p2p_offers cols:', cols.rows.map(r => r.column_name).join(', '));
  } finally { await c.end(); }
})();
