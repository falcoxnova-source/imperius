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

  // Get the full function source of purchase_plus_subscription
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'purchase_plus_subscription'");
  console.log('=== purchase_plus_subscription FULL SOURCE ===\n');
  console.log(r.rows[0].prosrc);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
