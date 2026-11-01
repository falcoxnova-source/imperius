const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  
  const result = await client.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'contribute_to_jackpot'
  `);
  
  console.log('Función contribute_to_jackpot:');
  console.log(result.rows[0]?.prosrc);
  
  await client.end();
}

main().catch(console.error);
