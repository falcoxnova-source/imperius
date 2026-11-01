const { Client } = require('pg');
const c = new Client({ host:'aws-1-eu-north-1.pooler.supabase.com', port:6543, user:'postgres.hhrgcnvydmjqcevgmlhj', password:'Jfs.samsung1989*', database:'postgres', ssl:{rejectUnauthorized:false} });
(async()=>{
  await c.connect();
  const {rows:[u]} = await c.query("SELECT id FROM profiles WHERE email='dark@gmail.com' LIMIT 1");
  if(!u){console.log('User not found');await c.end();return;}
  console.log('User:', u.id);
  const {rows} = await c.query(`
    UPDATE planet_resources pr SET
      metal = COALESCE((SELECT CASE WHEN COALESCE(pb.level,0)=0 THEN 10000 ELSE FLOOR(2500 * POWER(1.8327, COALESCE(pb.level,0)))::bigint END
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='metal_storage'), 10000),
      crystal = COALESCE((SELECT CASE WHEN COALESCE(pb.level,0)=0 THEN 10000 ELSE FLOOR(2500 * POWER(1.8327, COALESCE(pb.level,0)))::bigint END
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='crystal_storage'), 10000),
      deuterium = COALESCE((SELECT CASE WHEN COALESCE(pb.level,0)=0 THEN 10000 ELSE FLOOR(2500 * POWER(1.8327, COALESCE(pb.level,0)))::bigint END
        FROM planet_buildings pb JOIN building_types bt ON bt.id=pb.building_type_id
        WHERE pb.planet_id=pr.planet_id AND bt.code='deuterium_tank'), 10000),
      last_update = NOW()
    WHERE pr.planet_id IN (SELECT id FROM planets WHERE user_id=$1 AND planet_type='planet' AND NOT is_destroyed)
    RETURNING pr.planet_id, pr.metal, pr.crystal, pr.deuterium
  `, [u.id]);
  rows.forEach(r => console.log('Planet', r.planet_id, ': metal=' + r.metal, 'crystal=' + r.crystal, 'deut=' + r.deuterium));
  console.log('Done:', rows.length, 'planets filled');
  await c.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
