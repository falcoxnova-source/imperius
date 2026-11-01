const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async () => {
  await client.connect();
  const r = await client.query(`
    SELECT p.name, bt.code, bq.target_level, bq.queue_position,
           bq.start_time, bq.end_time, bq.build_time,
           (SELECT COALESCE(level,0) FROM planet_buildings pb WHERE pb.planet_id=p.id AND pb.building_type_id=bq.building_type_id) AS current_level
    FROM building_queue bq
    JOIN planets p ON p.id=bq.planet_id
    JOIN building_types bt ON bt.id=bq.building_type_id
    WHERE p.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com')
    ORDER BY p.name, bq.queue_position
  `);
  console.log('=== Cola completa de dark ===');
  r.rows.forEach(x => {
    console.log(`${x.name.padEnd(22)} #${x.queue_position} ${x.code.padEnd(25)} cur=L${x.current_level}→L${x.target_level}  time=${x.build_time}s  end=${x.end_time || 'NULL'}`);
  });

  // Ver oficiales del user
  const off = await client.query(`
    SELECT ot.code, uo.expires_at, uo.expires_at > now() AS active
    FROM user_officers uo JOIN officer_types ot ON ot.id=uo.officer_type_id
    WHERE uo.user_id=(SELECT id FROM profiles WHERE email='dark@gmail.com')
  `);
  console.log('\n=== Oficiales dark ===');
  off.rows.forEach(o => console.log(`  ${o.code}  expires=${o.expires_at}  active=${o.active}`));
  await client.end();
})();
