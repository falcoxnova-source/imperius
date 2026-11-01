const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const names = [
    'bot_process_queues',
    'complete_building_queue_item',
    'process_building_queue_internal',
    'process_all_user_building_queues',
    'global_process_all_expired_queues',
    'admin_process_all_pending_buildings',
    'admin_process_pending_buildings_batch',
    'admin_process_stuck_building_queues',
  ];
  for (const name of names) {
    const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname=$1`, [name]);
    if (!r.rows[0]) { console.log(`[${name}] NOT FOUND`); continue; }
    const src = r.rows[0].prosrc;
    const hasLB = src.toLowerCase().includes('lunar') || src.includes('= 15') || src.includes('fields_max');
    console.log(`\n========== ${name} (hasLB=${hasLB}, len=${src.length}) ==========`);
    // Find and print snippets around lunar_base or fields_max assignment
    const patterns = [/lunar/i, /fields_max/];
    for (const p of patterns) {
      const m = src.search(p);
      if (m >= 0) {
        console.log(`--- snippet around /${p}/ at ${m} ---`);
        console.log(src.substring(Math.max(0, m - 150), m + 600));
        break;
      }
    }
  }
  await c.end();
})();
