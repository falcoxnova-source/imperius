const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const r = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND (table_name ILIKE '%alliance%' OR table_name ILIKE '%ally%' OR table_name ILIKE '%guild%')
  `);
  for (const t of r.rows) {
    const cc = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [t.table_name]);
    console.log(`${t.table_name}: ${cc.rows.map(x=>x.column_name).join(', ')}`);
  }
  // alliance_id en profiles?
  const p = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name ILIKE '%alliance%'`);
  console.log('profiles alliance cols:', p.rows.map(x=>x.column_name));
  await client.end();
})();