const { Client } = require('pg');
const cfg = {
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
};
(async () => {
  const c = new Client(cfg); await c.connect();
  const r = await c.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
      AND (column_name ILIKE '%fxu%' OR column_name ILIKE '%usdt%' OR column_name ILIKE '%balance%' OR column_name ILIKE '%token%' OR column_name ILIKE '%dark_matter%')
    ORDER BY column_name
  `);
  console.log('Columnas de balance en profiles:');
  r.rows.forEach(c => console.log(`  ${c.column_name} (${c.data_type}) default=${c.column_default}`));
  const t = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%fxu%' OR table_name ILIKE '%usdt%' OR table_name ILIKE '%token%' OR table_name ILIKE '%wallet%' OR table_name ILIKE '%p2p%')
    ORDER BY table_name
  `);
  console.log('\nTablas relacionadas:');
  t.rows.forEach(r => console.log(`  ${r.table_name}`));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
