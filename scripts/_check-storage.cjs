const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await c.connect();
  
  // Check storage levels
  const {rows: storages} = await c.query(`
    SELECT p.id, p.name, bt.code, COALESCE(pb.level,0) as lvl
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id
    JOIN planet_buildings pb ON pb.planet_id = p.id
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pr.email = 'dark@gmail.com'
      AND bt.code IN ('metal_storage','crystal_storage','deuterium_tank')
      AND p.planet_type = 'planet'
    ORDER BY p.name, bt.code
  `);
  storages.forEach(r => console.log(r.name, r.code, 'lvl=' + r.lvl));

  // Check how storage capacity is calculated in the game
  const {rows: formula} = await c.query(`
    SELECT code, base_production, production_factor
    FROM building_types
    WHERE code IN ('metal_storage','crystal_storage','deuterium_tank')
  `);
  formula.forEach(r => console.log('Formula:', r.code, 'base_prod=', r.base_production, 'factor=', r.production_factor));

  // Check current resources
  const {rows: res} = await c.query(`
    SELECT p.name, pr2.metal, pr2.crystal, pr2.deuterium
    FROM profiles pr
    JOIN planets p ON p.user_id = pr.id
    JOIN planet_resources pr2 ON pr2.planet_id = p.id
    WHERE pr.email = 'dark@gmail.com' AND p.planet_type = 'planet'
  `);
  res.forEach(r => console.log(r.name, 'M:', Number(r.metal).toLocaleString(), 'C:', Number(r.crystal).toLocaleString(), 'D:', Number(r.deuterium).toLocaleString()));

  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
