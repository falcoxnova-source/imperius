const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const j = await c.query(`SELECT jobid, schedule, command, active FROM cron.job WHERE command ILIKE '%bot_ai_tick%' OR jobname ILIKE '%bot%'`);
  console.log('=== cron jobs bots ===');
  for (const r of j.rows) console.log(r);

  const count = await c.query(`SELECT COUNT(*)::int n FROM profiles WHERE is_bot=true`);
  console.log('total bots:', count.rows[0].n);

  const active = await c.query(`SELECT COUNT(*)::int n FROM profiles WHERE is_bot=true AND last_activity > now() - interval '7 days'`);
  console.log('bots activos últimos 7 días:', active.rows[0].n);

  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('is_bot','is_bot_paused','bot_paused','autopilot_active','last_activity')`);
  console.log('cols relevantes:', cols.rows);

  // Ver función bot_ai_tick: ¿cómo filtra qué bots procesa?
  const def = await c.query(`SELECT pg_get_functiondef(oid) AS s FROM pg_proc WHERE proname='bot_ai_tick'`);
  if (def.rows.length) {
    const s = def.rows[0].s;
    // extraer el WHERE del SELECT de bots
    const idx = s.indexOf('FROM profiles');
    console.log('\n--- fragmento bot_ai_tick WHERE bots ---');
    console.log(s.substring(Math.max(0, idx-100), idx+500));
  }

  await c.end();
})();
