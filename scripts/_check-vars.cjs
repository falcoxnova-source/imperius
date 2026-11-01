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
  console.log('Has v_ship_types_queued_this_tick?', src.includes('v_ship_types_queued_this_tick'));
  console.log('Has v_small_cargo_type_id integer;?', src.includes('v_small_cargo_type_id integer;'));
  const idx = src.indexOf('v_small_cargo_type_id integer');
  console.log('Around:', src.slice(idx, idx+200));
  await client.end();
})();
