const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260427181000_fix_secure_send_fleet_dedupe.sql');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

(async () => {
  await c.connect();
  await c.query(fs.readFileSync(SQL_FILE, 'utf8'));
  console.log('✅ Dedupe migration applied');

  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'secure_send_fleet'`);
  const def = r.rows[0]?.def || '';

  const dupDecl = (def.match(/v_mega_recycler_type_id int;/g) || []).length;
  const dupSel  = (def.match(/SELECT id INTO v_mega_recycler_type_id/g) || []).length;
  const dupMsg  = def.includes('Mega Recycler or Mega Recycler');
  const inOk    = def.includes('IN (v_recycler_type_id, v_mega_recycler_type_id)');

  console.log('Declaraciones duplicadas:', dupDecl, dupDecl === 1 ? '✅' : '❌');
  console.log('SELECT duplicados      :', dupSel, dupSel === 1 ? '✅' : '❌');
  console.log('Mensaje duplicado      :', dupMsg ? '❌' : '✅');
  console.log('Condicion IN           :', inOk ? '✅' : '❌');

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
