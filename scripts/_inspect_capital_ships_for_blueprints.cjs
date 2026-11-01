const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ship_types' ORDER BY ordinal_position
  `);
  console.log('ship_types columns:', cols.rows.map(r => r.column_name).join(', '));

  const ships = await client.query(`
    SELECT *
    FROM ship_types
    WHERE LOWER(name) LIKE '%nova%'
       OR LOWER(name) LIKE '%nodra%'
       OR LOWER(name) LIKE '%nodriza%'
       OR LOWER(code) LIKE '%nodra%'
       OR LOWER(code) LIKE '%nodriza%'
       OR LOWER(name) LIKE '%falco%'
       OR LOWER(name) LIKE '%capital%'
       OR LOWER(name) LIKE '%death%'
    ORDER BY weapon_power DESC NULLS LAST
  `);
  console.log('=== Naves capitales / candidatas ===');
  console.log(ships.rows);

  const bpcols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'ship_blueprints' ORDER BY ordinal_position
  `);
  console.log('ship_blueprints columns:', bpcols.rows.map(r => r.column_name).join(', '));

  const bps = await client.query(`SELECT * FROM ship_blueprints`);
  console.log('=== Planos actuales ===');
  console.log(bps.rows);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
