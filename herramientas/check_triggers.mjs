import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

// Check for triggers on profiles
const trig = await c.query("SELECT tgname, tgtype, pg_get_triggerdef(oid) as def FROM pg_trigger WHERE tgrelid = 'profiles'::regclass AND tgisinternal = false");
console.log('Triggers on profiles:', JSON.stringify(trig.rows, null, 2));

// Also check if the function was recently changed (check the SQL file)
await c.end();
