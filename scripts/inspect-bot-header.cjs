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
  const result = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'");
  const lines = result.rows[0].prosrc.split('\n');
  for (let i = 0; i < 40; i++) {
    console.log(`${i}: ${lines[i]}`);
  }
  await client.end();
}

run().catch(async (e) => { console.error(e); try { await client.end(); } catch {} process.exit(1); });
