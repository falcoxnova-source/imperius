const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Check for unique constraints on social_ranking_distributions
  const res = await c.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'social_ranking_distributions'
  `);
  console.log('Indexes on social_ranking_distributions:');
  res.rows.forEach(r => console.log(` - ${r.indexname}: ${r.indexdef}`));

  // Also check constraints
  const res2 = await c.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def
    FROM pg_constraint
    WHERE conrelid = 'social_ranking_distributions'::regclass
  `);
  console.log('\nConstraints:');
  res2.rows.forEach(r => console.log(` - ${r.conname} (${r.contype}): ${r.def}`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
