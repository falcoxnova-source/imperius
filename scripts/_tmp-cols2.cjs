const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  for (const t of ['planets','user_technologies','planet_ships','planet_defenses','planet_buildings','planet_resources']) {
    const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[t]);
    console.log(t+':', r.rows.map(x=>x.column_name).join(', '));
  }
  await c.end();
})();
