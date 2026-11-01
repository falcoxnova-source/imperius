const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  // Find resource-related tables/columns
  const r = await client.query(`
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_schema='public' AND (
      column_name LIKE '%crystal%' OR column_name LIKE '%cristal%' 
      OR column_name LIKE '%metal%' OR column_name LIKE '%deuter%'
      OR table_name LIKE '%resource%'
    )
    ORDER BY table_name, ordinal_position
  `);
  console.log('Resource columns found:');
  r.rows.forEach(row => console.log(`  ${row.table_name}.${row.column_name}`));

  await client.end();
}

main().catch(e => { console.error(e.message); client.end(); });
