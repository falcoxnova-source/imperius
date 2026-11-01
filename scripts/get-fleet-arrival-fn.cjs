const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const result = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'
    `);

    if (result.rows.length === 0) {
      console.log('Function process_fleet_arrival not found');
    } else {
      console.log('=== FULL SOURCE CODE OF process_fleet_arrival ===');
      console.log(result.rows[0].prosrc);
      console.log('=== END OF FUNCTION ===');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
