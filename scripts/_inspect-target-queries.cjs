const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await client.connect();
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  const src = fn.rows[0].prosrc;
  const lines = src.split('\n');
  lines.forEach((l,i)=>{
    if (l.includes('AND pr.is_bot = false')) {
      console.log(`\n--- L${i+1} contexto ---`);
      for (let j = Math.max(0,i-8); j <= Math.min(lines.length-1, i+2); j++) {
        console.log(`L${j+1}: ${lines[j]}`);
      }
    }
  });
  await client.end();
})();