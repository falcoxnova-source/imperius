const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // Get planet columns
  const { rows: cols } = await c.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'planets' ORDER BY ordinal_position
  `);
  console.log('=== PLANETS COLUMNS ===');
  console.log(cols.map(x => x.column_name).join(', '));

  // Get a sample planet to understand structure
  console.log('\n=== SAMPLE PLANET (Kul Tiras) ===');
  const { rows: sample } = await c.query(`
    SELECT * FROM planets WHERE name = 'Kul Tiras' LIMIT 1
  `);
  if (sample.length > 0) {
    console.log(JSON.stringify(sample[0], null, 2));
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
