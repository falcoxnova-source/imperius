import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const sql = fs.readFileSync('D:\\Falco-Xnova Bolt Supabase\\supabase\\migrations\\20260522_fix_validate_building_queue_function.sql', 'utf8');
await c.query(sql);
console.log('validate_building_queue function created successfully');
await c.end();
