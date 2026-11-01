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

// Check user_technologies structure
const cols = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='user_technologies' ORDER BY ordinal_position");
console.log('Columns:', cols.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

// Check user's current technologies
const userId = '9fa72d04-58e4-4297-bcc3-11b136b42493';
const userTech = await client.query("SELECT * FROM user_technologies WHERE user_id = $1 AND technology_type_id IN (4, 8)", [userId]);
console.log('User tech:', JSON.stringify(userTech.rows, null, 2));

// Check if user has any tech at all
const allTech = await client.query("SELECT * FROM user_technologies WHERE user_id = $1 LIMIT 5", [userId]);
console.log('Any tech:', JSON.stringify(allTech.rows, null, 2));

await client.end();
