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
  const r = await c.query(`
    SELECT key, value FROM game_settings 
    WHERE key LIKE '%pool%' OR key LIKE '%jackpot%' OR key LIKE '%market%' 
       OR key LIKE '%lottery%' OR key LIKE '%credit%' OR key LIKE '%rename%' 
       OR key LIKE '%transport%' OR key LIKE '%vip%' OR key LIKE '%plus%'
       OR key LIKE '%fee%' OR key LIKE '%destruction%' OR key LIKE '%social%'
       OR key LIKE '%withdrawal%' OR key LIKE '%transfer%'
    ORDER BY key
  `);
  console.log(JSON.stringify(r.rows, null, 2));
  c.end();
}).catch(e => { console.error(e.message); c.end(); });
