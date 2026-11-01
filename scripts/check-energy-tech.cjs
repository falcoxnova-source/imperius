const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Find ALL functions that reference energy 
  console.log('=== Functions referencing energy_max or energy_used ===');
  const fns = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc ILIKE '%energy_max%' OR prosrc ILIKE '%energy_used%'
    ORDER BY proname
  `);
  console.log(fns.rows.map(r => r.proname).join(', '));

  // Find the key function that calculates/recalculates energy
  console.log('\n=== Functions referencing solar_plant AND energy ===');
  const fns2 = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE prosrc ILIKE '%solar_plant%' AND (prosrc ILIKE '%energy%')
    ORDER BY proname
  `);
  console.log(fns2.rows.map(r => r.proname).join(', '));

  // Get the calculate_planet_energy or recalculate function
  console.log('\n=== Functions with "calculate" and "energy" ===');
  const fns3 = await c.query(`
    SELECT proname FROM pg_proc 
    WHERE proname ILIKE '%energy%' OR proname ILIKE '%recalc%'
    ORDER BY proname
  `);
  console.log(fns3.rows.map(r => r.proname).join(', '));

  // Get the most likely function for energy calculations
  for (const fname of ['calculate_planet_energy', 'recalculate_energy', 'recalculate_planet_energy', 'update_planet_energy', 'recalculate_planet_resources']) {
    const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1 LIMIT 1`, [fname]);
    if (fn.rows.length) {
      console.log(`\n=== ${fname} ===`);
      console.log(fn.rows[0].prosrc);
    }
  }

  // Also check get_planet_resources_production
  for (const fname of ['get_planet_resources_production', 'update_production_percentages', 'calculate_resource_production']) {
    const fn = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = $1 LIMIT 1`, [fname]);
    if (fn.rows.length) {
      console.log(`\n=== ${fname} ===`);
      console.log(fn.rows[0].prosrc);
    }
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
