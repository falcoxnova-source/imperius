const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false} });
c.connect().then(()=>c.query("SELECT (position('Autopilot cleanup' in prosrc)>0) as has_cleanup, (position('NOT has_autopilot_access(p.id)' in prosrc)>0) as has_revoke FROM pg_proc WHERE proname='bot_ai_tick'")).then(r=>{console.log(r.rows[0]);return c.end();});
