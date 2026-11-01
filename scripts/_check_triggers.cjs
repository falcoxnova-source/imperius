const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // All triggers on planets and planet_buildings
  const trg = await c.query(`
    SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
    FROM information_schema.triggers
    WHERE event_object_table IN ('planets','planet_buildings','building_queue')
    ORDER BY event_object_table, trigger_name`);
  for (const t of trg.rows) {
    console.log(`[${t.event_object_table}] ${t.trigger_name} ${t.action_timing} ${t.event_manipulation}`);
    console.log('  ', t.action_statement);
  }

  // Show recalculate_planet_fields function
  console.log('\n=== recalculate_planet_fields ===');
  const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname='recalculate_planet_fields'`);
  if (fn.rows[0]) console.log(fn.rows[0].prosrc);
  else console.log('(not found)');

  await c.end();
})();
