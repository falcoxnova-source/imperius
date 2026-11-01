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
  .then(() => c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"))
  .then(r => {
    console.table(r.rows);
    console.log('Total:', r.rowCount, 'tablas');
    c.end();
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    c.end();
  });
