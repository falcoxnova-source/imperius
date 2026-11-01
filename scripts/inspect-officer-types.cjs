const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  console.log('\n=== Estructura officer_types ===');
  const cols = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name='officer_types'
    ORDER BY ordinal_position
  `);
  console.table(cols.rows);

  console.log('\n=== Datos actuales officer_types ===');
  const rows = await client.query(`SELECT * FROM officer_types ORDER BY code`);
  console.log(rows.rows);

  console.log('\n=== user_officers cols ===');
  const uo = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name='user_officers'
    ORDER BY ordinal_position
  `);
  console.table(uo.rows);

  await client.end();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
