const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const r = await c.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname ILIKE '%tick%' OR p.proname ILIKE '%autopilot%') ORDER BY proname`);
  console.table(r.rows);

  const r2 = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND (column_name ILIKE '%autopilot%' OR column_name ILIKE '%bot%') ORDER BY column_name`);
  console.table(r2.rows);

  const r3 = await c.query(`SELECT id, username, is_bot, autopilot_active, autopilot_eligible FROM profiles WHERE id='50da268b-d729-4f06-b8af-e03aa0437c1f'`);
  console.log('PIPI:', r3.rows[0]);

  // Ver cómo bot_ai_tick selecciona bots (para confirmar que excluye humanos)
  const r4 = await c.query(`SELECT substring(prosrc FROM position('FOR v_bot' IN prosrc) FOR 400) AS snippet FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='bot_ai_tick' AND n.nspname='public'`);
  console.log('--- bot_ai_tick FOR v_bot ---');
  console.log(r4.rows[0].snippet);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
