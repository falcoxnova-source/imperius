const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260427180000_allow_mega_recycler_in_recycle_missions.sql');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  const sql = fs.readFileSync(SQL_FILE, 'utf8');
  console.log('Applying:', path.basename(SQL_FILE));
  const res = await c.query(sql);
  if (res && Array.isArray(res)) {
    res.forEach(r => r?.command && console.log(r.command));
  }

  // Verify
  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_send_fleet'`);
  const def = r.rows[0]?.def || '';
  const ok = def.includes('v_mega_recycler_type_id')
          && def.includes('IN (v_recycler_type_id, v_mega_recycler_type_id)')
          && def.includes('Recycler or Mega Recycler');
  console.log('Patch applied correctly:', ok ? '✅' : '❌');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
