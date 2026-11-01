const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  for (let i=0;i<8;i++) { await client.query('SELECT bot_ai_tick()'); console.log(`tick ${i+1}`); }
  const q = await client.query(`
    SELECT p.name, st.code, sq.quantity
    FROM shipyard_queue sq
    JOIN planets p ON p.id=sq.planet_id
    JOIN ship_types st ON st.id=sq.ship_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com') AND sq.item_type='ship'
    ORDER BY sq.created_at DESC
  `);
  console.log('\nColas dark actuales:');
  q.rows.forEach(r => console.log(`  ${r.name.padEnd(22)} ${r.code.padEnd(20)} x${r.quantity}`));
  await client.end();
})();
