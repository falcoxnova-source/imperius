const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  const lines = fn.rows[0].prosrc.split('\n');
  console.log('=== Lines 380-445 (building loop) ===');
  for (let i = 378; i <= 445 && i < lines.length; i++) console.log(`L${i+1}: ${lines[i]}`);
  await client.end();
})();
