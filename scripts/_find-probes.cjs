const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const fn = await client.query(`SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick' LIMIT 1`);
  const src = fn.rows[0].prosrc;
  const lines = src.split('\n');
  // Buscar referencias a probe / espionage_probe / spy_probe
  const matches = [];
  lines.forEach((l,i) => {
    if (/espionage_probe|spy_probe|'probe|probe'|small_cargo/i.test(l)) matches.push([i+1, l.trim()]);
  });
  console.log('=== Referencias a probe en bot_ai_tick ===');
  matches.forEach(([n,l]) => console.log(`L${n}: ${l.slice(0,200)}`));

  // Ver ship_priority block
  console.log('\n=== Lines 500-560 (ship priority) ===');
  for (let i = 498; i <= 560 && i < lines.length; i++) console.log(`L${i+1}: ${lines[i]}`);
  await client.end();
})();
