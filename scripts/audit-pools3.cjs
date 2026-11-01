const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Full market purchase function
  console.log('=== FULL purchase_market_listing FUNCTION ===');
  const mkt = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'purchase_market_listing' LIMIT 1`);
  if (mkt.rows[0]) {
    const src = mkt.rows[0].prosrc;
    console.log(src);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
