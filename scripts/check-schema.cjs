const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';

(async () => {
  await c.connect();

  // Check building_types columns
  const btCols = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'building_types' ORDER BY ordinal_position
  `);
  console.log('=== building_types COLUMNS ===');
  btCols.rows.forEach(r => console.log(r.column_name));

  // Check planet_buildings columns
  const pbCols = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'planet_buildings' ORDER BY ordinal_position
  `);
  console.log('\n=== planet_buildings COLUMNS ===');
  pbCols.rows.forEach(r => console.log(r.column_name));

  // Check building_requirements columns
  const brCols = await c.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'building_requirements' ORDER BY ordinal_position
  `);
  console.log('\n=== building_requirements COLUMNS ===');
  brCols.rows.forEach(r => console.log(r.column_name));

  // Get all building types
  const bt = await c.query(`SELECT * FROM building_types LIMIT 5`);
  console.log('\n=== SAMPLE building_types ===');
  console.log(Object.keys(bt.rows[0]));
  bt.rows.forEach(r => console.log(JSON.stringify(r)));

  await c.end();
})();
