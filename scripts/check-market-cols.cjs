const { Client } = require('pg');
async function main() {
  const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
  await c.connect();
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='market_listings' ORDER BY ordinal_position");
  console.log('market_listings columns:');
  r.rows.forEach(x => console.log('  ' + x.column_name));
  
  // Check what tables exist for market
  const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%market%' AND table_schema='public'");
  console.log('\nMarket tables:');
  t.rows.forEach(x => console.log('  ' + x.table_name));
  
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
