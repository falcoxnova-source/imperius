const { Client } = require('pg');
async function main() {
  const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});
  await c.connect();

  // Check update_user_points
  const r1 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_user_points'
  `);
  console.log('=== update_user_points ===');
  r1.rows.forEach(r => console.log(r.def));

  // Check update_alliance_points complexity
  const r2 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_alliance_points'
  `);
  console.log('\n=== update_alliance_points ===');
  r2.rows.forEach(r => console.log(r.def));

  // Check update_all_alliance_rankings
  const r3 = await c.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_all_alliance_rankings'
  `);
  console.log('\n=== update_all_alliance_rankings ===');
  r3.rows.forEach(r => console.log(r.def));

  // Check existing pg_cron jobs
  const r4 = await c.query(`SELECT * FROM cron.job ORDER BY jobid`);
  console.log('\n=== EXISTING pg_cron JOBS ===');
  r4.rows.forEach(r => console.log(`  [${r.jobid}] "${r.jobname}" schedule="${r.schedule}" command="${r.command.substring(0,120)}..."`));

  // Check number of alliance members and alliances
  const r5 = await c.query(`
    SELECT 
      (SELECT count(*) FROM alliances) as alliances,
      (SELECT count(*) FROM alliance_members) as members,
      (SELECT count(*) FROM profiles WHERE last_activity > now() - interval '15 minutes') as online_users
  `);
  console.log('\n=== STATS ===');
  console.log(r5.rows[0]);

  await c.end();
}
main().catch(console.error);
