const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await client.connect();
  const r = await client.query(`
    SELECT p.name, st.code, sq.quantity, sq.created_at
    FROM shipyard_queue sq
    JOIN planets p ON p.id = sq.planet_id
    LEFT JOIN ship_types st ON st.id = sq.ship_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com')
    ORDER BY sq.created_at DESC
  `);
  console.log('Dark shipyard queues:');
  r.rows.forEach(x => console.log(`${x.name}: ${x.code} x${x.quantity} (${x.created_at})`));
  await client.end();
})();