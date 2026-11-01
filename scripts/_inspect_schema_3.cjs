const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
const MAIN = '4ae2e0ea-9112-41f2-8a83-c17f6001e254';
(async () => {
  await c.connect();

  console.log('--- requisitos deathstar ---');
  const reqs = await c.query(`
    SELECT bt.code AS bld, sr.required_building_level AS bld_lvl, tt.code AS tech, sr.required_tech_level AS tech_lvl
    FROM ship_requirements sr
    LEFT JOIN building_types bt ON bt.id = sr.required_building_id
    LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
    WHERE sr.ship_type_id = 14
  `);
  console.table(reqs.rows);

  console.log('\n--- edificios planeta principal Wolf King ---');
  const blds = await c.query(`
    SELECT bt.code, bt.id AS btid, pb.level
    FROM planet_buildings pb
    JOIN building_types bt ON bt.id = pb.building_type_id
    WHERE pb.planet_id = $1
    ORDER BY bt.code
  `, [MAIN]);
  console.table(blds.rows);

  console.log('\n--- tecnologias Wolf King ---');
  const techs = await c.query(`
    SELECT tt.code, tt.id AS ttid, ut.level
    FROM user_technologies ut
    JOIN technology_types tt ON tt.id = ut.technology_type_id
    WHERE ut.user_id = $1
    ORDER BY tt.code
  `, [USER_ID]);
  console.table(techs.rows);

  console.log('\n--- planet_buildings columns ---');
  const pbc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_buildings' ORDER BY ordinal_position`);
  console.log(pbc.rows.map(x=>x.column_name).join(', '));

  console.log('\n--- planet_ships columns ---');
  const psc = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='planet_ships' ORDER BY ordinal_position`);
  console.log(psc.rows.map(x=>x.column_name).join(', '));

  console.log('\n--- existing planet_ships entry for deathstar (any) ---');
  const ps = await c.query(`SELECT * FROM planet_ships WHERE planet_id=$1`, [MAIN]);
  console.table(ps.rows);

  // Find recalc points function
  console.log('\n--- recalc point functions ---');
  const fn = await c.query(`SELECT proname FROM pg_proc WHERE proname ILIKE '%point%' OR proname ILIKE '%recalc%' ORDER BY proname`);
  console.log(fn.rows.map(x=>x.proname));

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
