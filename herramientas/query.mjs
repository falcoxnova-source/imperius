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
const userRes = await client.query("SELECT id, username, email FROM profiles WHERE email LIKE '%immicrobinson%' OR username LIKE '%immicrobinson%'");
console.log('Profiles:', JSON.stringify(userRes.rows, null, 2));
const authRes = await client.query("SELECT id, email FROM auth.users WHERE email LIKE '%immicrobinson%'");
console.log('Auth:', JSON.stringify(authRes.rows, null, 2));
// Also check all tables
const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
console.log('Tables:', tables.rows.map(r => r.table_name));
await client.end();
