const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await client.connect();
  
  // Vaciar todas las colas de naves de dark para forzar nuevas construcciones variadas
  console.log('Limpiando colas de naves de dark para prueba...');
  await client.query(`
    DELETE FROM shipyard_queue sq
    USING planets p
    WHERE sq.planet_id = p.id
      AND p.user_id = (SELECT id FROM profiles WHERE email='dark@gmail.com')
      AND sq.item_type = 'ship'
  `);

  // Ejecutar 3 ticks
  for (let i=0;i<3;i++) {
    const r = await client.query('SELECT bot_ai_tick()');
    console.log(`Tick ${i+1}: ships_queued=${r.rows[0].bot_ai_tick.ships_queued}`);
  }

  // Ver qué quedó en cola
  const q = await client.query(`
    SELECT p.name, st.code, sq.quantity, sq.queue_position
    FROM shipyard_queue sq
    JOIN planets p ON p.id=sq.planet_id
    JOIN ship_types st ON st.id=sq.ship_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com') AND sq.item_type='ship'
    ORDER BY p.name, sq.queue_position
  `);
  console.log('\nColas dark por planeta:');
  const byPlanet = {};
  q.rows.forEach(r => { (byPlanet[r.name] ||= []).push(`${r.code} x${r.quantity}`); });
  Object.entries(byPlanet).forEach(([p, items]) => {
    console.log(`  ${p} (${items.length} tipos): ${items.join(', ')}`);
  });

  await client.end();
})();