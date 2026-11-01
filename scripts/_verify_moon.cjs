const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    SELECT p.id, p.name, p.planet_type, p.galaxy, p.solar_system, p.position,
           pb.level AS phalanx_lvl, pb2.level AS lunar_base_lvl
    FROM planets p
    LEFT JOIN planet_buildings pb ON pb.planet_id=p.id AND pb.building_type_id=16
    LEFT JOIN planet_buildings pb2 ON pb2.planet_id=p.id AND pb2.building_type_id=15
    WHERE p.id='190d9f92-479c-4a2e-bd37-b9c8d27f9511'
  `);
  console.log('Luna NOVA:', r.rows[0]);

  // Check unique constraint
  const idx = await c.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename='planet_buildings'
  `);
  console.log('\nÍndices planet_buildings:');
  idx.rows.forEach(i=>console.log(`  ${i.indexname}: ${i.indexdef}`));

  // Multiple rows for same planet+type?
  const dup = await c.query(`SELECT planet_id, building_type_id, COUNT(*) FROM planet_buildings WHERE planet_id='190d9f92-479c-4a2e-bd37-b9c8d27f9511' GROUP BY 1,2 HAVING COUNT(*)>1`);
  console.log('\nDuplicados:', dup.rows);

  await c.end();
})();
