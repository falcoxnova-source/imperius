import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const sql = fs.readFileSync('supabase/migrations/20260522_blueprint_drop_absolute_chance.sql', 'utf8');
await c.query(sql);
console.log('Funcion actualizada OK');
await c.end();
