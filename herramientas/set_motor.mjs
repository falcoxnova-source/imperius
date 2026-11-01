import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();
const r = await c.query("UPDATE user_technologies SET level = 11 WHERE user_id = '9fa72d04-58e4-4297-bcc3-11b136b42493' AND technology_type_id = 8 RETURNING level");
console.log(r.rows[0].level);
await c.end();
