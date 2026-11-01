const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const tabs = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%building%' OR table_name ILIKE '%catalog%' OR table_name ILIKE '%type%')`);
  console.log('Posibles catálogos:', tabs.rows.map(r=>r.table_name));

  // Probar building_types
  for (const t of ['building_types','buildings','building_type','game_buildings']) {
    try {
      const r = await c.query(`SELECT * FROM ${t} ORDER BY 1 LIMIT 30`);
      if (r.rows.length) { console.log(`\n=== ${t} (${r.rows.length}) ===`); r.rows.forEach(x=>console.log(x)); break; }
    } catch(e) {}
  }

  // Building actuales en luna
  const moonId = '190d9f92-479c-4a2e-bd37-b9c8d27f9511';
  const b = await c.query(`SELECT * FROM planet_buildings WHERE planet_id=$1`, [moonId]);
  console.log('\nEdificios en luna:', b.rows);

  // Buscar phalanx / lunar_base
  const search = await c.query(`SELECT DISTINCT building_type_id FROM planet_buildings`);
  console.log('\nbuilding_type_id distintos:', search.rows.map(r=>r.building_type_id));

  await c.end();
})();
