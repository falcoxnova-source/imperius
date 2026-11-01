const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  // Replica la query que hace fetchActiveOfficers
  const userId = (await client.query(`SELECT id FROM profiles WHERE email='dark@gmail.com'`)).rows[0].id;
  const r = await client.query(`
    SELECT uo.*, ot.code AS otype_code, ot.name AS otype_name
    FROM user_officers uo
    LEFT JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE uo.user_id = $1 AND uo.expires_at >= NOW()
  `, [userId]);
  console.log('user_officers (active):');
  r.rows.forEach(x => console.log(JSON.stringify(x, null, 2)));

  // Cols de user_officers
  const cols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='user_officers' AND table_schema='public'
    ORDER BY ordinal_position
  `);
  console.log('\nuser_officers cols:', cols.rows.map(c=>c.column_name).join(', '));
  await client.end();
})();
