const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260505_p2p_phase10b_chat_telegram_dm.sql');
  await c.query('BEGIN');
  try {
    await c.query(fs.readFileSync(file, 'utf8'));
    await c.query('COMMIT');
    console.log('✓ Migration applied');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }
  const t = await c.query("SELECT tgname FROM pg_trigger WHERE tgname='trg_p2p_message_notify_telegram'");
  console.log('trigger:', t.rows.map(r => r.tgname).join(','));
  await c.end();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
