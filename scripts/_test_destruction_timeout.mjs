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

// Simular el timeout que PostgREST aplica a authenticated (usually 8s on free tier)
await c.query('SET ROLE authenticated');
await c.query("SET statement_timeout = '8s'");

const t0 = Date.now();
try {
  const r = await c.query('SELECT * FROM get_destruction_ranking()');
  console.log(`OK en ${Date.now()-t0}ms - rows: ${r.rows.length}`);
} catch (e) {
  console.log(`ERROR en ${Date.now()-t0}ms:`, e.message);
}
await c.query('RESET ROLE');
await c.end();
