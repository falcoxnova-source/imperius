const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const t = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND (column_name ILIKE '%storage%' OR table_name ILIKE '%building%')
    ORDER BY table_name, ordinal_position
  `);
  const byTable = {};
  t.rows.forEach(r => { (byTable[r.table_name] ||= []).push(r.column_name); });
  for (const [tbl, cols] of Object.entries(byTable)) {
    console.log(`\n${tbl}:`);
    cols.forEach(c => console.log(`  - ${c}`));
  }
  await client.end();
})();
