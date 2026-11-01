const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const s = await c.query(`select key, value from game_settings where key in ('p2p_usdt_fxu_peg','p2p_fee_percent','p2p_dispute_cooldown_minutes','p2p_max_daily_volume_fxu','p2p_max_open_orders_per_user') order by key`);
  console.log('settings:', s.rows);
  const col = await c.query(`select column_name from information_schema.columns where table_name='p2p_reputation' and column_name='abandoned_orders'`);
  console.log('abandoned_orders col:', col.rows);
  const tg = await c.query(`select tgname from pg_trigger where tgname='trg_p2p_track_abandoned_order'`);
  console.log('trigger:', tg.rows);
  const rpc = await c.query(`select * from get_p2p_reputations_for_users(ARRAY[]::uuid[])`);
  console.log('rpc ok, rows:', rpc.rowCount, 'cols:', rpc.fields.map(f=>f.name));
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
