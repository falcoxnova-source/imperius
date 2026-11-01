const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await c.connect();
  const {rows:[u]} = await c.query("SELECT id FROM profiles WHERE email='dark@gmail.com' LIMIT 1");
  if(!u){console.log('User not found');await c.end();return;}

  // Use the exact game formula: 5000 * floor(2.5 * exp(20*level/33))
  const {rows} = await c.query(`
    UPDATE planet_resources pr SET
      metal = COALESCE((
        SELECT FLOOR(5000 * FLOOR(2.5 * EXP(20.0 * COALESCE(pb.level,0) / 33.0)))
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='metal_storage'
      ), 10000),
      crystal = COALESCE((
        SELECT FLOOR(5000 * FLOOR(2.5 * EXP(20.0 * COALESCE(pb.level,0) / 33.0)))
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='crystal_storage'
      ), 10000),
      deuterium = COALESCE((
        SELECT FLOOR(5000 * FLOOR(2.5 * EXP(20.0 * COALESCE(pb.level,0) / 33.0)))
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='deuterium_tank'
      ), 10000),
      last_update = NOW()
    WHERE pr.planet_id IN (SELECT id FROM planets WHERE user_id=$1 AND planet_type='planet' AND NOT is_destroyed)
    RETURNING pr.planet_id, pr.metal, pr.crystal, pr.deuterium
  `, [u.id]);
  rows.forEach(r => console.log('Planet', r.planet_id, ': metal=' + Number(r.metal).toLocaleString(), 'crystal=' + Number(r.crystal).toLocaleString(), 'deut=' + Number(r.deuterium).toLocaleString()));
  console.log('Done:', rows.length, 'planets filled to MAX capacity');
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
