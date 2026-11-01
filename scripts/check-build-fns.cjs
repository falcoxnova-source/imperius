const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const FNS = [
  'complete_building_queue_item',
  'process_completed_building_queue',
  'process_building_queue_internal',
  'admin_process_pending_buildings_batch',
  'admin_process_all_pending_buildings',
  'admin_process_stuck_building_queues',
  'bot_process_queues',
  'global_process_all_expired_queues',
  'process_all_user_building_queues',
  'process_all_user_queues_on_reconnect',
  'secure_activate_building_queue',
];

(async () => {
  await c.connect();
  for (const fn of FNS) {
    const r = await c.query(
      `SELECT pg_get_functiondef(p.oid) AS src
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname=$1`,
      [fn]
    );
    if (!r.rowCount) { console.log(`-- ${fn}: NOT FOUND`); continue; }
    const src = r.rows[0].src;
    const hasLunarFix = /lunar_base|v_is_lunar_base|building_type_id\s*=\s*15/i.test(src) && /fields_max\s*=\s*1\s*\+/.test(src);
    const mentionsFieldsUsed = /fields_used/.test(src);
    const mentionsLevel = /(target_level|new_level|level\s*\+\s*1)/.test(src);
    console.log(`\n=== ${fn} ===`);
    console.log(`  len=${src.length}  fields_used?${mentionsFieldsUsed}  level?${mentionsLevel}  hasLunarFix?${hasLunarFix}`);
    // Print short snippet around first fields_used occurrence
    const idx = src.indexOf('fields_used');
    if (idx >= 0) {
      console.log('  --- snippet ---');
      console.log('  ' + src.slice(Math.max(0,idx-200), idx+400).replace(/\n/g,'\n  '));
    }
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
