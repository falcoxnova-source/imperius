const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const t = await client.query(`SELECT id, code, name FROM building_types WHERE code ILIKE '%storage%' OR code ILIKE '%tank%' OR name ILIKE '%almac%' OR name ILIKE '%storage%' OR name ILIKE '%tank%' ORDER BY code`);
  console.log('Storage buildings:');
  t.rows.forEach(r => console.log(` ${r.id} | ${r.code} | ${r.name}`));
  await client.end();
})();
