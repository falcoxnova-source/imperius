const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const PIPI = '50da268b-d729-4f06-b8af-e03aa0437c1f';

  console.log('=== jackpot_history ===');
  const j = await c.query(`SELECT * FROM jackpot_history WHERE user_id=$1 ORDER BY created_at`, [PIPI]);
  for (const r of j.rows) console.log(r);

  console.log('\n=== plus_subscriptions ===');
  const ps = await c.query(`SELECT * FROM plus_subscriptions WHERE user_id=$1`, [PIPI]);
  for (const r of ps.rows) console.log(r);

  console.log('\n=== p2p_offers (PIPI vendió/compró) ===');
  const cOff = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='p2p_offers'`);
  console.log('cols p2p_offers:', cOff.rows.map(r=>r.column_name).join(','));
  const off = await c.query(`SELECT * FROM p2p_offers WHERE user_id=$1 ORDER BY created_at`, [PIPI]);
  for (const r of off.rows) console.log(r);

  console.log('\n=== p2p_trades donde PIPI interviene ===');
  const hasP2P = await c.query(`SELECT to_regclass('public.p2p_trades') AS t`);
  if (hasP2P.rows[0].t) {
    const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='p2p_trades'`);
    console.log('cols p2p_trades:', cols.rows.map(r => r.column_name).join(', '));
    const tr = await c.query(`SELECT * FROM p2p_trades WHERE seller_id=$1 OR buyer_id=$1 ORDER BY created_at`, [PIPI]);
    console.log('n=', tr.rows.length);
    for (const r of tr.rows) console.log(r);
  }

  console.log('\n=== telegram_task_rewards ===');
  const tg = await c.query(`SELECT * FROM telegram_task_rewards WHERE user_id=$1`, [PIPI]);
  for (const r of tg.rows) console.log(r);

  console.log('\n=== referral_commissions (pagadas a PIPI) ===');
  try {
    const rc = await c.query(`SELECT * FROM referral_commissions WHERE referrer_id=$1 ORDER BY created_at`, [PIPI]);
    console.log('n=', rc.rows.length);
    let sumUsdt = 0;
    for (const r of rc.rows) {
      console.log(r);
      sumUsdt += Number(r.usdt_amount || r.amount_usdt || 0);
    }
    console.log('Suma USDT:', sumUsdt);
  } catch(e) { console.log('err', e.message); }

  console.log('\n=== plus_commission_rewards ===');
  try {
    const pcr = await c.query(`SELECT * FROM plus_commission_rewards WHERE user_id=$1 ORDER BY created_at`, [PIPI]);
    console.log('n=', pcr.rows.length);
    for (const r of pcr.rows) console.log(r);
  } catch(e) {}

  console.log('\n=== plus_pending_rewards ===');
  try {
    const pp = await c.query(`SELECT * FROM plus_pending_rewards WHERE user_id=$1`, [PIPI]);
    for (const r of pp.rows) console.log(r);
  } catch(e) {}

  console.log('\n=== social/destruction/monthly ranking rewards ===');
  for (const t of ['social_ranking_rewards','destruction_ranking_rewards','monthly_ranking_rewards']) {
    try {
      const r = await c.query(`SELECT * FROM ${t} WHERE user_id=$1`, [PIPI]);
      if (r.rows.length) { console.log('-- ' + t + ' --'); for (const x of r.rows) console.log(x); }
    } catch(e) {}
  }

  await c.end();
})();
