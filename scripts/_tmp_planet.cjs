const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
(async () => {
  await c.connect();
  try {
    const uid = '50da268b-d729-4f06-b8af-e03aa0437c1f';
    const cols = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='planets' AND (column_name ILIKE '%crystal%' OR column_name ILIKE '%mine%' OR column_name='is_principal' OR column_name='is_capital' OR column_name='is_main' OR column_name='name') ORDER BY 1"
    );
    console.log('cols:', cols.rows);
    const planets = await c.query(
      "SELECT * FROM planets WHERE user_id=$1 ORDER BY created_at ASC",
      [uid]
    );
    console.log('planets count:', planets.rows.length);
    if (planets.rows[0]) {
      const p = planets.rows[0];
      console.log('first planet keys:', Object.keys(p));
      console.log('first planet:', { id: p.id, name: p.name, is_principal: p.is_principal, is_capital: p.is_capital, is_main: p.is_main, crystal_mine_level: p.crystal_mine_level });
    }
  } finally { await c.end(); }
})();
