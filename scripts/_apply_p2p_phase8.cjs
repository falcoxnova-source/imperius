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
  console.log('✓ Connected');
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260502_p2p_phase8_chat_evidence.sql');
  const sql = fs.readFileSync(file, 'utf8');
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Migration applied');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  }

  const b = await c.query("SELECT id, public FROM storage.buckets WHERE id='p2p-evidence'");
  console.log('Bucket:', b.rows[0]);
  const p = await c.query("SELECT policyname FROM pg_policies WHERE tablename='objects' AND policyname LIKE 'p2p_evidence%'");
  console.log('Policies:', p.rows.map(r => r.policyname).join(', '));
  const f = await c.query("SELECT proname FROM pg_proc WHERE proname='p2p_send_message'");
  console.log('Function:', f.rows.map(r => r.proname).join(', '));

  await c.end();
})().catch((e) => { console.error('✗', e.message); process.exit(1); });
