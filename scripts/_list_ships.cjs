const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`SELECT id, code, name, category, weapon_power, shield_power, structural_integrity, cargo_capacity, base_speed, metal_cost, crystal_cost, deuterium_cost FROM ship_types ORDER BY category, weapon_power`);
  console.table(r.rows);
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
