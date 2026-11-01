const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();
  const r = await c.query(
    "SELECT id, username, email, created_at FROM profiles WHERE LOWER(username) LIKE '%pato%autista%' OR LOWER(username) LIKE '%pato_autista%' LIMIT 5"
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
