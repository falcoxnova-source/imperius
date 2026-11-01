const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618290000_falco_x_above_deathstar.sql'), 'utf8');
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('✓ Falco-X rebalanceada por encima de Death Star');

    const r = await c.query(
      "SELECT code, structural_integrity, weapon_power, shield_power, cargo_capacity, base_speed, metal_cost, crystal_cost, deuterium_cost, build_time_seconds FROM ship_types WHERE code IN ('falco_x_clasica','deathstar','nova') ORDER BY code"
    );
    console.table(r.rows);

    const reqs = await c.query(
      `SELECT bt.name AS building, tt.name AS tech, sr.required_building_level, sr.required_tech_level
       FROM ship_requirements sr
       LEFT JOIN building_types bt ON bt.id = sr.required_building_id
       LEFT JOIN technology_types tt ON tt.id = sr.required_tech_id
       WHERE sr.ship_type_id = (SELECT id FROM ship_types WHERE code='falco_x_clasica')
       ORDER BY sr.id`
    );
    console.log('Requisitos Falco-X:');
    console.table(reqs.rows);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('✗', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
