const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
(async()=>{
  await c.connect();
  const names = ['MarinaAR72','LuisKR','Natalia88','CamilaAR77','RubenRD','CarlosKR54','SergioJR','AndresJR','CarlosJR','PabloJR'];
  const r = await c.query(`
    SELECT p.username, p.created_at AS p_created, p.updated_at AS p_updated, p.last_activity,
           u.created_at AS u_created
    FROM profiles p JOIN auth.users u ON u.id=p.id
    WHERE p.username = ANY($1::text[])
    ORDER BY p.points_total DESC
  `, [names]);
  r.rows.forEach(x => console.log(x.username,
    '| profile.created_at=', x.p_created.toISOString(),
    '| auth.users.created_at=', x.u_created.toISOString(),
    '| last_activity=', x.last_activity.toISOString()));
  await c.end();
})();
