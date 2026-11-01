const { Client } = require('pg');
const fs = require('fs');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const FNS = ['global_process_all_expired_queues','process_all_user_building_queues','admin_process_stuck_building_queues','bot_process_queues'];
(async()=>{
  await c.connect();
  let out='';
  for(const fn of FNS){
    const r=await c.query(`SELECT pg_get_functiondef(p.oid) AS src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`,[fn]);
    out += `\n\n=============== ${fn} ===============\n` + r.rows[0].src;
  }
  fs.writeFileSync('d:\\Falco-Xnova Bolt\\scripts\\_broken_fns_dump.sql', out);
  console.log('Written to _broken_fns_dump.sql (', out.length, 'chars )');
  await c.end();
})();
