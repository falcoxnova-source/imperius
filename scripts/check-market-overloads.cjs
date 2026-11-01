const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  // 1. Check ALL overloaded versions of cancel_market_listing
  console.log('=== ALL cancel_market_listing OVERLOADS ===');
  const res1 = await client.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as identity_args,
           char_length(p.prosrc) as src_len,
           p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'cancel_market_listing'
    AND n.nspname = 'public'
  `);
  for (const row of res1.rows) {
    console.log(`\nOID: ${row.oid}`);
    console.log(`Args: ${row.args}`);
    console.log(`Identity args: ${row.identity_args}`);
    console.log(`Source length: ${row.src_len}`);
    console.log('--- SOURCE ---');
    const lines = row.prosrc.split('\n');
    lines.forEach((line, i) => {
      console.log(`${(i+1).toString().padStart(4)}: ${line}`);
    });
    console.log('--- END ---');
  }

  // 2. Check ALL overloaded versions of create_market_listing
  console.log('\n=== ALL create_market_listing OVERLOADS ===');
  const res2 = await client.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_arguments(p.oid) as args,
           char_length(p.prosrc) as src_len
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'create_market_listing'
    AND n.nspname = 'public'
  `);
  for (const row of res2.rows) {
    console.log(`OID: ${row.oid}, Args: ${row.args}, Src: ${row.src_len} chars`);
  }

  // 3. Check ALL overloaded versions of purchase_market_listing
  console.log('\n=== ALL purchase_market_listing OVERLOADS ===');
  const res3 = await client.query(`
    SELECT p.oid, p.proname, 
           pg_get_function_arguments(p.oid) as args,
           char_length(p.prosrc) as src_len
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'purchase_market_listing'
    AND n.nspname = 'public'
  `);
  for (const row of res3.rows) {
    console.log(`OID: ${row.oid}, Args: ${row.args}, Src: ${row.src_len} chars`);
  }

  // 4. Check what the frontend is actually calling
  // By looking at how Supabase routes RPC calls with parameters
  console.log('\n=== Test: Which function matches the frontend call? ===');
  console.log('Frontend calls: cancel_market_listing({ p_listing_id, p_return_planet_id })');
  console.log('This means 2 arguments of type uuid');

  await client.end();
}

main().catch(console.error);
