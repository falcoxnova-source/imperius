const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

c.connect()
  .then(() => c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LIMIT 20"))
  .then(r => {
    console.log('✅ Conexión exitosa! Tablas encontradas:\n');
    r.rows.forEach((row, i) => console.log(`  ${i + 1}. ${row.tablename}`));
    console.log(`\nTotal mostradas: ${r.rows.length}`);
    c.end();
  })
  .catch(e => {
    console.error('❌ Error:', e.message);
    c.end();
  });
