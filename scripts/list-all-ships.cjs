const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // All ships sorted by weapon power
  console.log('=== ALL SHIPS ===');
  const all = await c.query('SELECT id, code, name, weapon_power, shield_power, structural_integrity, rapid_fire FROM ship_types ORDER BY weapon_power DESC');
  console.table(all.rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    weapon: r.weapon_power,
    shield: r.shield_power,
    hull: r.structural_integrity,
    rf: JSON.stringify(r.rapid_fire).substring(0, 80)
  })));

  await c.end();
})();
