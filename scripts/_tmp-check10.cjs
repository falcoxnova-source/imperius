const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async()=>{
  await c.connect();
  const names = ['MarinaAR72','LuisKR','Natalia88','CamilaAR77','RubenRD','CarlosKR54','SergioJR','AndresJR','CarlosJR','PabloJR'];
  const r = await c.query(
    `SELECT username, points_total, points_buildings, points_research, points_fleet, points_defense, is_bot, created_at
     FROM profiles
     WHERE username = ANY($1::text[])
     ORDER BY created_at DESC`,
    [names]
  );
  r.rows.forEach(x => {
    console.log(x.username, '=>', x.points_total, '|', x.points_buildings, x.points_research, x.points_fleet, x.points_defense, '| bot=', x.is_bot);
  });
  await c.end();
})();
