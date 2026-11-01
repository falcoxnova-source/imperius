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
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260618330000_falco_x_capital_between_deathstar_nova.sql'), 'utf8');
  await c.query(sql);
  const r = await c.query(`SELECT code, name, category, weapon_power, shield_power, structural_integrity, cargo_capacity, base_speed, metal_cost, crystal_cost, deuterium_cost FROM ship_types WHERE code IN ('deathstar','falco_x_clasica','nova') ORDER BY weapon_power`);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
