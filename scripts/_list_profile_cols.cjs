const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles'
    ORDER BY ordinal_position`);
  console.log('ALL columns of profiles:');
  r.rows.forEach(x => console.log(`  ${x.column_name}  ${x.data_type}`));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
