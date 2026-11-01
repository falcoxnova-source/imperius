const { Client } = require('pg');
const fs = require('fs');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const result = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  fs.writeFileSync('scripts/process_fleet_arrival_CURRENT.sql', result.rows[0].prosrc, 'utf8');
  console.log('Saved! Length: ' + result.rows[0].prosrc.length + ' chars');
  await client.end();
}

main().catch(e => console.error(e));
