const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
const USER_ID = 'eeb87cde-abc9-48db-b3ee-b4c3a370d188';
(async () => {
  await c.connect();

  console.log('--- ship_requirements columns ---');
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ship_requirements' ORDER BY ordinal_position`);
  console.log(cols.rows.map(x=>x.column_name).join(', '));

  // Look for any prerequisite tables
  const tabs = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%require%' OR table_name ILIKE '%prereq%' OR table_name ILIKE '%depen%') ORDER BY table_name`);
  console.log('\nrelated tabs:', tabs.rows.map(x=>x.table_name));

  console.log('\n--- planets Wolf King ---');
  const pls = await c.query(`SELECT * FROM planets WHERE user_id=$1 LIMIT 5`, [USER_ID]);
  console.table(pls.rows);

  console.log('\n--- building_types ---');
  const bt = await c.query(`SELECT id, code, name FROM building_types ORDER BY code`);
  console.table(bt.rows);

  console.log('\n--- technology_types ---');
  const tt = await c.query(`SELECT id, code, name FROM technology_types ORDER BY code`);
  console.table(tt.rows);

  console.log('\n--- ship_types (capitals) ---');
  const st = await c.query(`SELECT id, code, name FROM ship_types WHERE code IN ('deathstar','falco_x_clasica','nova','destruccion_masiva','mega_recycler') ORDER BY code`);
  console.table(st.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
