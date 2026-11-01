const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. Death Star stats
  console.log('=== SHIP STATS ===');
  const ships = await c.query(
    `SELECT code, name, weapon_power, shield_power, structural_integrity, rapid_fire, cargo_capacity
     FROM ship_types
     WHERE code IN ('death_star','battleship','battlecruiser','cruiser','heavy_fighter','light_fighter','destroyer','bomber')
     ORDER BY weapon_power DESC`
  );
  console.table(ships.rows.map(r => ({...r, rapid_fire: JSON.stringify(r.rapid_fire)})));

  // 2. Death Star specific
  console.log('\n=== DEATH STAR DETAIL ===');
  const ds = await c.query(`SELECT * FROM ship_types WHERE code = 'death_star'`);
  const dsRow = ds.rows[0];
  console.log('weapon_power:', dsRow.weapon_power);
  console.log('shield_power:', dsRow.shield_power);
  console.log('structural_integrity:', dsRow.structural_integrity);
  console.log('rapid_fire:', JSON.stringify(dsRow.rapid_fire, null, 2));

  // 3. Check if there's a rapid_fire table too
  console.log('\n=== RAPID FIRE TABLES ===');
  const tables = await c.query(`SELECT tablename FROM pg_tables WHERE tablename LIKE '%rapid%'`);
  console.log('Rapid fire tables:', tables.rows.map(r => r.tablename));

  await c.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
