const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='fleets' ORDER BY ordinal_position`);
  console.log('fleets cols:', cols.rows.map(r=>r.column_name).join(', '));

  // Fleet bot counts
  const fl = await c.query(`SELECT COUNT(*)::int n FROM fleets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot=true)`);
  console.log('Flotas bot totales:', fl.rows[0].n);

  // FKs
  const fks = await c.query(`
    SELECT tc.table_name, kcu.column_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
    JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
    WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='profiles'
    ORDER BY tc.table_name
  `);
  console.log('\n=== FKs -> profiles ===');
  fks.rows.forEach(f=>console.log(`  ${f.table_name}.${f.column_name}  delete=${f.delete_rule}`));

  await c.end();
})();
