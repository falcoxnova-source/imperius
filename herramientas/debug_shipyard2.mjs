import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30000
});
await c.connect();

const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'secure_add_to_shipyard_queue'");
const body = r.rows[0].prosrc;
const lines = body.split('\n');
for (let i = 200; i <= 215; i++) {
  console.log(`${i}: ${JSON.stringify(lines[i])}`);
}

await c.end();
