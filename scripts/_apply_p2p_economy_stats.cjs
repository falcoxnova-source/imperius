#!/usr/bin/env node
/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CONN = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260426_p2p_economy_stats.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const c = new Client(CONN);
  await c.connect();
  console.log('✓ Connected');

  try {
    await c.query(sql);
    console.log('✓ Migration applied: get_p2p_economy_stats()');

    // Test
    const r = await c.query(`SELECT get_p2p_economy_stats() AS s`);
    const s = r.rows[0].s;
    console.log('\n=== P2P Economy Stats (test) ===');
    console.log('success:', s.success);
    if (s.success) {
      console.log('Volume FXU total:', s.volume_fxu_total);
      console.log('Volume USDT total:', s.volume_usdt_total);
      console.log('Fees FXU total:', s.fees_fxu_total);
      console.log('Fees USDT total:', s.fees_usdt_total);
      console.log('Orders total:', s.orders_total, '| released:', s.orders_released, '| disputed:', s.orders_disputed);
      console.log('Disputes open/inv/res:', s.disputes_open, '/', s.disputes_investigating, '/', s.disputes_resolved);
      console.log('Active offers:', s.offers_active, `(sell FXU:${s.offers_sell_fxu} USDT:${s.offers_sell_usdt} / buy FXU:${s.offers_buy_fxu} USDT:${s.offers_buy_usdt})`);
      console.log('Traders total/30d:', s.traders_total, '/', s.traders_30d);
    } else {
      console.log('Note: running as non-admin returns {success:false} — expected.');
    }
  } catch (e) {
    console.error('✗ Error:', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
