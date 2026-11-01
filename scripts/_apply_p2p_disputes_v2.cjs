const { Client } = require('pg');
const fs = require('fs');
const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};
(async () => {
  const c = new Client(cfg); await c.connect();
  try {
    // check profiles.name column
    const col = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('name','username','display_name')`);
    console.log('profiles name columns:', col.rows);

    const sql = fs.readFileSync('supabase/migrations/20260424_p2p_disputes_admin_v2.sql', 'utf8');
    await c.query(sql);
    console.log('✅ Migración aplicada');

    // Test list RPC existence
    const r = await c.query(`SELECT proname FROM pg_proc WHERE proname IN ('p2p_admin_resolve_dispute','p2p_admin_list_disputes')`);
    console.table(r.rows);
  } catch (e) {
    console.error('❌', e.message);
  } finally { await c.end(); }
})();
