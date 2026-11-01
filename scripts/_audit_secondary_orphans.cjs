const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('=== Tablas que referencian planets/fleets/alliances ===');
  const fks = await c.query(`
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS refs
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY'
      AND ccu.table_name IN ('planets','fleets','alliances','research_queue','user_technologies','battle_reports')
      AND tc.table_name NOT IN ('planets','fleets','alliances','research_queue','user_technologies','battle_reports')
    ORDER BY ccu.table_name, tc.table_name
  `);
  fks.rows.forEach(f=>console.log(`  ${f.table_name}.${f.column_name} -> ${f.refs}`));

  console.log('\n=== Huérfanos por tabla ===');
  for (const f of fks.rows) {
    try {
      const r = await c.query(`SELECT COUNT(*)::int n FROM ${f.table_name} WHERE ${f.column_name} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${f.refs} r WHERE r.id = ${f.table_name}.${f.column_name})`);
      if (r.rows[0].n>0) console.log(`  ⚠ ${f.table_name}.${f.column_name}: ${r.rows[0].n} huérfanos`);
    } catch(e) { console.log(`  (${f.table_name} error: ${e.message.split('\n')[0]})`); }
  }

  await c.end();
})();
