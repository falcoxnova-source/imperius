process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- Listings activos del Falco-X (market_listings) ---');
  const cols = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='market_listings'")).rows.map(r=>r.column_name).join(', ');
  console.log('cols market_listings:', cols);
  const cols2 = (await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='blueprint_market_escrow'")).rows.map(r=>r.column_name).join(', ');
  console.log('cols blueprint_market_escrow:', cols2);

  console.log('--- Buscar listings activos con item_code falco_x ---');
  try {
    console.table((await c.query("SELECT id, status, item_code, item_id FROM market_listings WHERE (item_code='bp_falco_x_clasica') AND status IN ('active','listed','open')")).rows);
  } catch (e) { console.log('err market_listings filter:', e.message); }

  console.log('--- Escrow del Falco-X ---');
  try {
    console.table((await c.query("SELECT * FROM blueprint_market_escrow LIMIT 50")).rows);
  } catch (e) { console.log('err escrow:', e.message); }

  await c.end();
})();
