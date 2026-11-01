const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // 1. Market fix applied?
  const q1 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'purchase_market_listing'
  `);
  const hasFix = q1.rows.length > 0 && q1.rows[0].def.includes('p_buyer_planet_id');
  console.log(`1. Market bug fix (p_buyer_planet_id): ${hasFix ? '✅ APPLIED' : '❌ NOT APPLIED'}`);

  // 2. CPU triggers lightweight?
  const q2 = await c.query(`
    SELECT t.tgname, c.relname, p.proname as fn
    FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgname LIKE '%point%' ORDER BY c.relname
  `);
  const allQueue = q2.rows.every(r => r.fn.startsWith('queue_') || r.fn === 'sync_alliance_points_on_profile_change');
  console.log(`2. Lightweight triggers: ${allQueue ? '✅ ALL OK' : '❌ SOME OLD'}`);

  // 3. Batch points cron running?
  const q3 = await c.query(`
    SELECT jobname, 
      (SELECT status FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY start_time DESC LIMIT 1) as last_status,
      (SELECT start_time FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY start_time DESC LIMIT 1) as last_run
    FROM cron.job j WHERE jobname = 'batch-update-points'
  `);
  if (q3.rows.length > 0) {
    console.log(`3. batch-update-points cron: ✅ last run=${q3.rows[0].last_run}, status=${q3.rows[0].last_status}`);
  } else {
    console.log(`3. batch-update-points cron: ❌ NOT FOUND`);
  }

  // 4. Queue working?
  const q4 = await c.query(`SELECT count(*) as cnt FROM points_update_queue`);
  console.log(`4. Points queue entries: ${q4.rows[0].cnt} (normal: 0-20 depending on activity)`);

  // 5. Index?
  const q5 = await c.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_fleet_ships_fleet_id'`);
  console.log(`5. idx_fleet_ships_fleet_id: ${q5.rows.length > 0 ? '✅' : '❌'}`);

  // 6. Points still updating for active players?
  const q6 = await c.query(`
    SELECT username, points_total, updated_at 
    FROM profiles WHERE last_activity > now() - interval '10 minutes'
    ORDER BY points_total DESC LIMIT 3
  `);
  console.log(`6. Active players with points:`);
  q6.rows.forEach(r => console.log(`   ${r.username}: ${r.points_total} pts (updated: ${r.updated_at})`));

  console.log('\n========================================');
  if (hasFix && allQueue && q3.rows.length > 0 && q5.rows.length > 0) {
    console.log('🎉 TODO APLICADO CORRECTAMENTE');
    console.log('No falta nada. El sistema está optimizado.');
  } else {
    if (!hasFix) console.log('⚠️  Falta: aplicar migración del market fix');
    if (!allQueue) console.log('⚠️  Falta: triggers aún son los pesados');
    if (q3.rows.length === 0) console.log('⚠️  Falta: pg_cron batch-update-points');
    if (q5.rows.length === 0) console.log('⚠️  Falta: índice fleet_ships');
  }

  await c.end();
}
main().catch(console.error);
