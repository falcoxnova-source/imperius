const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618150000_admin_npc_empire_v2_always_colonize.sql'), 'utf8');
  await c.query(sql);
  console.log('✅ Empire v2 installed');
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
