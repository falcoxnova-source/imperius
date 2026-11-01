const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
  // Check jackpot_pools table
  const r1 = await c.query(`SELECT * FROM jackpot_pools ORDER BY code`);
  console.log('=== JACKPOT POOLS ===');
  console.log(JSON.stringify(r1.rows, null, 2));
  
  // Check all game_settings
  const r2 = await c.query(`SELECT key, value FROM game_settings ORDER BY key`);
  console.log('\n=== ALL GAME SETTINGS ===');
  console.log(JSON.stringify(r2.rows, null, 2));

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
