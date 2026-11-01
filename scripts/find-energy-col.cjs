const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const r = await c.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE column_name ILIKE '%energy%'
    ORDER BY table_name, column_name
  `);
  r.rows.forEach(x => console.log(x.table_name, '.', x.column_name));
  await c.end();
})();
