const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const src = fs.readFileSync(path.join(__dirname, '_bot_ai_tick_current.sql'), 'utf8');
  // The dump starts with CREATE OR REPLACE FUNCTION ... we need to execute it as-is.
  // But pg_get_functiondef prepends with CREATE OR REPLACE FUNCTION already.
  try {
    await c.query(src);
    console.log('✅ bot_ai_tick patched with miner fixes');
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
