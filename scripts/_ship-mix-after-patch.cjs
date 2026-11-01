const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
  database: 'postgres', ssl: { rejectUnauthorized: false },
});
(async()=>{
  await client.connect();
  const r = await client.query(`
    SELECT st.code, COUNT(*)::int as queues, SUM(sq.quantity)::int as units
    FROM shipyard_queue sq
    JOIN planets p ON p.id=sq.planet_id
    JOIN profiles pr ON pr.id=p.user_id
    JOIN ship_types st ON st.id=sq.ship_type_id
    WHERE sq.item_type='ship'
      AND sq.created_at >= NOW() - INTERVAL '10 minutes'
      AND (pr.is_bot = true OR pr.autopilot_active = true)
    GROUP BY st.code
    ORDER BY units DESC
  `);
  console.log('Mix últimos 10 min (bots/autopilot):');
  r.rows.forEach(x=>console.log(`${x.code}: queues=${x.queues}, units=${x.units}`));
  await client.end();
})();