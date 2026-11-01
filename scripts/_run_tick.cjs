const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const t0 = Date.now();
    const r = await c.query('SELECT bot_ai_tick() AS result');
    const ms = Date.now() - t0;
    console.log(`✅ tick OK in ${ms}ms`);
    console.log(JSON.stringify(r.rows[0].result, null, 2));
  } catch (e) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
