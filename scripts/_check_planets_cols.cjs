const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cp = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planets' ORDER BY ordinal_position`);
  console.log('planets cols:', cp.rows.map(r=>r.column_name).join(', '));

  const cb = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planet_buildings' ORDER BY ordinal_position`);
  console.log('\nplanet_buildings cols:', cb.rows.map(r=>r.column_name).join(', '));

  const uid = '9700c4e0-d0e4-4efa-baf7-e9cb97945b16';
  const planets = await c.query(`SELECT * FROM planets WHERE user_id=$1`, [uid]);
  console.log('\nPlanetas NOVA:', planets.rows.length);
  planets.rows.forEach(p=>console.log({id:p.id,name:p.name,planet_type:p.planet_type,parent:p.parent_planet_id,galaxy:p.galaxy,system:p.system,position:p.position}));

  await c.end();
})();
