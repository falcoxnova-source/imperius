const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query("UPDATE game_settings SET value='2' WHERE key='p2p_dispute_cooldown_minutes' RETURNING key, value");
  console.log(r.rows);
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
