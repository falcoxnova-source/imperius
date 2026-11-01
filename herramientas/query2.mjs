import pg from 'pg';
const { Client } = pg;
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000
});
await client.connect();

// Check profiles for any user with michel or robinson in email
const prof = await client.query("SELECT id, username, email FROM profiles WHERE email ILIKE '%michel%' OR email ILIKE '%robinson%' OR username ILIKE '%michel%' LIMIT 20");
console.log('Matching profiles:', JSON.stringify(prof.rows, null, 2));

// Also check auth.users
const auth = await client.query("SELECT id, email FROM auth.users WHERE email ILIKE '%michel%' OR email ILIKE '%robinson%' LIMIT 20");
console.log('Matching auth:', JSON.stringify(auth.rows, null, 2));

await client.end();
