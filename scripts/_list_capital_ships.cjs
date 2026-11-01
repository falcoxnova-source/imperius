const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT code, name, category, weapon_power, structural_integrity, shield_power,
           metal_cost, crystal_cost, deuterium_cost
    FROM ship_types
    WHERE category = 'special' OR weapon_power >= 80000
    ORDER BY weapon_power DESC NULLS LAST
  `);
  console.table(r.rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
