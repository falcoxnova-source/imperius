const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const moonId = '190d9f92-479c-4a2e-bd37-b9c8d27f9511'; // Luna de NOVA

  // Construcciones a aplicar:
  // 15 = lunar_base nivel 5
  // 16 = sensor_phalanx nivel 5
  // 11 = shipyard nivel 1 (para fabricar en luna si quiere)
  // 9  = robotics_factory nivel 1 (acelera)
  const buildings = [
    [15, 5], // Base Lunar
    [16, 5], // Sensor Phalanx
    [11, 1], // Hangar
    [9,  1], // Fábrica de Robots
  ];

  try {
    await c.query('BEGIN');
    for (const [bt, lvl] of buildings) {
      await c.query(`
        INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
        VALUES ($1, $2, $3, false)
        ON CONFLICT (planet_id, building_type_id) DO UPDATE SET level=EXCLUDED.level, is_upgrading=false
      `, [moonId, bt, lvl]);
      console.log(`✓ building_type ${bt} -> level ${lvl}`);
    }

    const r = await c.query(`
      SELECT bt.code, bt.name, pb.level, pb.is_upgrading
      FROM planet_buildings pb
      JOIN building_types bt ON bt.id=pb.building_type_id
      WHERE pb.planet_id=$1
      ORDER BY pb.building_type_id
    `, [moonId]);
    console.log('\nLuna ahora:');
    r.rows.forEach(x=>console.log(`  ${x.code.padEnd(20)} lvl ${x.level}`));

    await c.query('COMMIT');
    console.log('\n✓ COMMIT');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode=1;
  } finally { await c.end(); }
})();
