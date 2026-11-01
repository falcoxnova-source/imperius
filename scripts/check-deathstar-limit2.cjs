const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='create_market_listing' LIMIT 1");
  const src = r.rows[0].prosrc;
  const lines = src.split('\n');
  // Find the deathstar block and show 5 lines before/after
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('deathstar')) {
      const start = Math.max(0, i - 5);
      const end = Math.min(lines.length - 1, i + 5);
      console.log(`--- Context around line ${i} ---`);
      for (let j = start; j <= end; j++) {
        console.log(`${j}: ${lines[j]}`);
      }
      console.log('---');
    }
  }
  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
