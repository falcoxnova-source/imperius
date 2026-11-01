const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618140000_admin_npc_empire_distribution.sql'), 'utf8');
  await c.query(sql);
  console.log('✅ Empire distribution function installed');
  const r = await c.query("SELECT proname FROM pg_proc WHERE proname='admin_distribute_npc_roles_smart'");
  console.log('Installed:', r.rows.map(x => x.proname));
  await c.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
