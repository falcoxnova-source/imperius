const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to database');

  const res = await client.query(
    "SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'purchase_market_listing'"
  );

  if (res.rows.length === 0) {
    console.log('Function not found');
  } else {
    for (const row of res.rows) {
      console.log(row.def);
      console.log('---END OF DEFINITION---');
    }
  }

  await client.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
