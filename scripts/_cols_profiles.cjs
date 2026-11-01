const { Client } = require('pg');
const c = new Client({ connectionString: 'postgresql://postgres.hhrgcnvydmjqcevgmlhj:Jfs.samsung1989*@aws-1-eu-north-1.pooler.supabase.com:6543/postgres' });
(async () => {
  await c.connect();
  const r = await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by column_name`);
  r.rows.forEach(x => console.log(x.column_name));
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
