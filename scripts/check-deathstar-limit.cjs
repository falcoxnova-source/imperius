const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='create_market_listing' LIMIT 1");
  const src = r.rows[0].prosrc;
  const lines = src.split('\n');
  const relevant = lines.filter(l => 
    l.toLowerCase().includes('deathstar') || l.toLowerCase().includes('30000') || 
    l.toLowerCase().includes('min_price') || l.toLowerCase().includes('price_limit')
  );
  console.log('Lines matching deathstar/30000/min_price:', relevant.length);
  relevant.forEach(l => console.log('  >', l.trim()));
  if (relevant.length === 0) console.log('No server-side deathstar price limit found in SQL function');
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
