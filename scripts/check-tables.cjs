const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
});

const userId = 'e11e6baa-c599-440c-aaaa-b98008182b4b';

(async () => {
  await c.connect();

  // Find relevant table names
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema='public' 
    AND (table_name ILIKE '%research%' OR table_name ILIKE '%terraform%' OR table_name ILIKE '%building%')
    ORDER BY table_name
  `);
  console.log('=== TABLES ===');
  tables.rows.forEach(r => console.log(r.table_name));

  // Check columns of planets table for terraformer
  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'planets' AND column_name ILIKE '%terraform%'
  `);
  console.log('\n=== PLANET TERRAFORM COLUMNS ===');
  cols.rows.forEach(r => console.log(r.column_name));

  // Check all planet columns
  const allCols = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'planets'
    ORDER BY column_name
  `);
  console.log('\n=== ALL PLANET COLUMNS ===');
  allCols.rows.forEach(r => console.log(r.column_name));

  await c.end();
})();
