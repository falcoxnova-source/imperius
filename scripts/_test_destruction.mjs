import { Client } from 'pg';
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
await c.connect();
try {
  const r = await c.query('SELECT * FROM get_destruction_ranking() LIMIT 3');
  console.log('OK rows:', r.rows.length);
  console.log(r.rows[0]);
} catch (e) {
  console.log('ERROR:', e.message);
  console.log('Detail:', e.detail);
  console.log('Hint:', e.hint);
  console.log('Where:', e.where);
}
await c.end();
