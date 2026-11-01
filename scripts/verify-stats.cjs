const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*'
});

c.connect().then(async () => {
  const r1 = await c.query('SELECT get_public_game_stats()');
  const stats = r1.rows[0].get_public_game_stats;
  console.log('Login bar - total_withdrawn:', stats.total_withdrawn, 'total_deposited:', stats.total_deposited);
  
  const r2 = await c.query('SELECT * FROM get_platform_financial_stats()');
  console.log('Admin card:', JSON.stringify(r2.rows[0]));
  
  c.end();
}).catch(e => { console.error(e.message); c.end(); });
