const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const sql = fs.readFileSync('supabase/migrations/20260425_p2p_dispute_fee_to_fxu.sql', 'utf8');
  await c.query(sql);
  console.log('✅ Migration applied: p2p dispute fee USDT -> FXU conversion');

  // Verify rate exists
  const r = await c.query("SELECT key, value FROM game_settings WHERE key='fxu_usd_rate'");
  console.log('📊 fxu_usd_rate:', r.rows[0]);

  await c.end();
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
