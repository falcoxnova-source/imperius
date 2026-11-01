const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });

(async()=>{
  await c.connect();
  const res = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'admin_distribute_social_ranking_pool'`);
  console.log(res.rows[0].prosrc);
  await c.end();
})();
