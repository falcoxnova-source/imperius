const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='building_requirements' ORDER BY ordinal_position`);
  console.log('cols:', cols.rows.map(r=>r.column_name).join(', '));
  const r = await c.query(`SELECT * FROM building_requirements WHERE building_type_id IN (15,16) ORDER BY building_type_id`);
  console.log('Requisitos lunar_base/phalanx:', r.rows);
  await c.end();
})();
