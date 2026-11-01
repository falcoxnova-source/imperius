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
  try {
    await client.connect();
    console.log('✅ Conexión exitosa a Supabase!\n');

    // Listar todas las tablas
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('=== TABLAS EN LA BASE DE DATOS ===\n');
    res.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.table_name}`);
    });
    console.log(`\n📊 Total: ${res.rows.length} tablas`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

main();
