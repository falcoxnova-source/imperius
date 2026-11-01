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

// Find hyperdrive technology
const tech = await client.query("SELECT * FROM technology_types WHERE name ILIKE '%hiper%' OR name ILIKE '%hyper%' OR name ILIKE '%propulsion%'");
console.log('Technology types:', JSON.stringify(tech.rows, null, 2));

// Check if there's a user_technologies or similar table
const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%technol%' OR table_name LIKE '%research%' OR table_name LIKE '%tech%') ORDER BY table_name");
console.log('Relevant tables:', tables.rows.map(r => r.table_name));

await client.end();
