const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const r = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'format_unit_report'");
  if (r.rows.length === 0) {
    console.log('FUNCTION NOT FOUND!');
  } else {
    console.log(r.rows[0].prosrc);
  }
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
