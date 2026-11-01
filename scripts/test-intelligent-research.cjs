const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query('SELECT bot_ai_tick() AS result');
    console.log('✅ Tick result:', JSON.stringify(r.rows[0].result));

    // Check recent research events
    const logs = await c.query(`
      SELECT event_type, payload, created_at
      FROM autopilot_events
      WHERE event_type = 'research_started'
        AND created_at > NOW() - INTERVAL '2 minutes'
      ORDER BY created_at DESC
      LIMIT 15
    `);
    console.log(`\n📚 ${logs.rows.length} researches started recently:`);
    for (const row of logs.rows) {
      console.log(`  • ${row.payload.technology} L${row.payload.next_level} (planet_role=${row.payload.role}, empire_role=${row.payload.empire_role})`);
    }
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
