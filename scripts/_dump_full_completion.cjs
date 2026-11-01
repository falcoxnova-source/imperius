const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  for (const name of ['complete_building_queue_item','process_building_queue_internal','global_process_all_expired_queues']) {
    const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname=$1`, [name]);
    console.log(`\n================ ${name} (FULL) ================`);
    console.log(r.rows[0].prosrc);
  }
  await c.end();
})();
