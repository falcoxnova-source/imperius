const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cleans = [
    ['fleet_ships','fleet_id','fleets'],
    ['autopilot_events','planet_id','planets'],
    ['building_queue','planet_id','planets'],
    ['planet_buildings','planet_id','planets'],
    ['planet_defenses','planet_id','planets'],
    ['planet_resources','planet_id','planets'],
    ['planet_ships','planet_id','planets'],
    ['shipyard_queue','planet_id','planets'],
  ];

  try {
    await c.query('BEGIN');
    await c.query(`SET LOCAL session_replication_role='replica'`);

    let total = 0;
    for (const [t,col,ref] of cleans) {
      const r = await c.query(`DELETE FROM ${t} WHERE ${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${ref} r WHERE r.id=${t}.${col})`);
      console.log(`  - ${t}.${col}: ${r.rowCount} borrados`);
      total += r.rowCount;
    }

    // Liberar galaxy_positions.occupied_by que apunten a planetas inexistentes
    const gp = await c.query(`UPDATE galaxy_positions SET occupied_by=NULL WHERE occupied_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM planets p WHERE p.id=galaxy_positions.occupied_by)`);
    console.log(`  ~ galaxy_positions.occupied_by: ${gp.rowCount} liberados`);

    // fleets huérfanas que referencian acs_fleets inexistentes? acs_fleets huérfanos
    const acs = await c.query(`DELETE FROM acs_fleets WHERE main_fleet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fleets f WHERE f.id=acs_fleets.main_fleet_id)`).catch(()=>({rowCount:0}));
    if (acs.rowCount) console.log(`  - acs_fleets: ${acs.rowCount} borrados`);
    const acsp = await c.query(`DELETE FROM acs_participants WHERE fleet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fleets f WHERE f.id=acs_participants.fleet_id)`).catch(()=>({rowCount:0}));
    if (acsp.rowCount) console.log(`  - acs_participants: ${acsp.rowCount} borrados`);

    console.log(`\nTotal: ${total+gp.rowCount+acs.rowCount+acsp.rowCount}`);
    await c.query('COMMIT');
    console.log('>>> COMMIT');
  } catch(e) {
    await c.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode=1;
  } finally {
    await c.end();
  }
})();
