const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // Broader search for tables that could represent USDT cashouts
  const r = await c.query(`
    SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND (table_name ILIKE '%tx%' OR table_name ILIKE '%transaction%'
            OR table_name ILIKE '%credit%' OR table_name ILIKE '%balance%'
            OR table_name ILIKE '%wallet%' OR table_name ILIKE '%claim%'
            OR table_name ILIKE '%fxu%' OR table_name ILIKE '%ledger%')
     ORDER BY table_name`);
  console.log('candidate tables:', r.rows.map(x => x.table_name));

  // Search columns that include 'usdt' or 'amount_usdt'
  const cols = await c.query(`
    SELECT table_name, column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND (column_name ILIKE '%usdt%' OR column_name ILIKE '%withdraw%' OR column_name ILIKE '%cashout%')
     ORDER BY table_name, column_name`);
  console.log('\ncolumns with usdt/withdraw:');
  for (const co of cols.rows) console.log(' ', co.table_name, '.', co.column_name, '(', co.data_type, ')');
  await c.end();
})();
