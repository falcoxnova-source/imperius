const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*'
});

c.connect().then(async () => {
  // Get planet resource columns
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='planets' ORDER BY ordinal_position`);
  console.log('=== PLANET COLUMNS ===');
  console.log(cols.rows.map(x => x.column_name).join(', '));

  // Check moon current state
  const moon = await c.query(`SELECT * FROM planets WHERE id = 'd89b8446-9d73-47d5-ae7f-2d19caa2ad9c'`);
  if (moon.rows.length > 0) {
    const m = moon.rows[0];
    console.log('\n=== MOON CURRENT STATE ===');
    console.log('Name:', m.name);
    console.log('Type:', m.planet_type);
    console.log('Resources:', 'resource_metal:', m.resource_metal, 'resource_crystal:', m.resource_crystal, 'resource_deuterium:', m.resource_deuterium);
    // Try other resource column patterns
    for (const [k, v] of Object.entries(m)) {
      if (k.includes('metal') || k.includes('crystal') || k.includes('deut') || k.includes('resource')) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  // Check ship capacities in ships config
  const ships = await c.query(`SELECT * FROM ship_types WHERE code IN ('deathstar', 'large_cargo') ORDER BY code`);
  console.log('\n=== SHIP TYPES ===');
  for (const s of ships.rows) {
    console.log(`${s.code}: cargo_capacity=${s.cargo_capacity}`);
    for (const [k, v] of Object.entries(s)) {
      if (k.includes('cargo') || k.includes('capacity')) {
        console.log(`  ${k}: ${v}`);
      }
    }
  }

  c.end();
}).catch(e => { console.error(e.message); c.end(); });
