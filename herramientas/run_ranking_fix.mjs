import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const sql = fs.readFileSync('supabase/migrations/20260522_fix_destruction_ranking_div1000.sql', 'utf8');
await c.query(sql);
console.log('Funcion get_destruction_ranking actualizada OK');
await c.end();
