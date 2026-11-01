const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await client.connect();
  
  // Tecnologías de dark
  const techs = await client.query(`
    SELECT tt.code, ut.level
    FROM user_technologies ut JOIN technology_types tt ON tt.id=ut.technology_type_id
    WHERE ut.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com') AND ut.level>0
    ORDER BY tt.code
  `);
  console.log('Tecnologías dark:');
  techs.rows.forEach(t=>console.log(`  ${t.code}=${t.level}`));
  
  // Naves disponibles (con requisitos cumplidos para dark) 
  const ships = await client.query(`
    SELECT st.id, st.code, st.name, st.metal_cost, st.crystal_cost, st.deuterium_cost
    FROM ship_types st ORDER BY st.metal_cost ASC
  `);
  console.log('\nTodas las naves:');
  for (const s of ships.rows) {
    const reqs = await client.query(`
      SELECT bt.code as bcode, sr.required_building_level,
             tt.code as tcode, sr.required_tech_level
      FROM ship_requirements sr
      LEFT JOIN building_types bt ON bt.id=sr.required_building_id
      LEFT JOIN technology_types tt ON tt.id=sr.required_tech_id
      WHERE sr.ship_type_id=$1
    `, [s.id]);
    console.log(`  ${s.code.padEnd(20)} reqs: ${reqs.rows.map(r=>r.bcode?`${r.bcode}>=${r.required_building_level}`:`${r.tcode}>=${r.required_tech_level}`).join(', ')||'ninguno'}`);
  }
  
  // Flota principal de dark
  const fleet = await client.query(`
    SELECT p.name, st.code, ps.quantity
    FROM planet_ships ps
    JOIN planets p ON p.id=ps.planet_id
    JOIN ship_types st ON st.id=ps.ship_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com') AND ps.quantity>0
    ORDER BY p.name, st.code
  `);
  console.log('\nFlota actual de dark:');
  fleet.rows.forEach(f=>console.log(`  ${f.name}: ${f.code} x${f.quantity}`));

  await client.end();
})();