const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();

  // Find recent battles with death stars
  const reports = await c.query(`
    SELECT m.id, m.subject, m.created_at, m.body
    FROM messages m
    WHERE m.message_type = 'battle'
      AND m.body::text LIKE '%deathstar%'
    ORDER BY m.created_at DESC
    LIMIT 5
  `);

  console.log('Found', reports.rows.length, 'battle reports with deathstars\n');

  for (const row of reports.rows) {
    const b = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
    console.log('='.repeat(80));
    console.log('Date:', row.created_at);
    console.log('Subject:', row.subject);

    // Show fleets
    if (b.attacker_fleet || b.attacker_ships) {
      const fleet = b.attacker_fleet || b.attacker_ships;
      console.log('\nAttacker fleet:');
      if (Array.isArray(fleet)) {
        fleet.forEach(s => console.log(`  ${s.ship_name || s.name || s.code}: ${s.quantity || s.count}`));
      } else {
        console.log(JSON.stringify(fleet));
      }
    }

    if (b.defender_fleet || b.defender_ships) {
      const fleet = b.defender_fleet || b.defender_ships;
      console.log('\nDefender fleet:');
      if (Array.isArray(fleet)) {
        fleet.forEach(s => console.log(`  ${s.ship_name || s.name || s.code}: ${s.quantity || s.count}`));
      } else {
        console.log(JSON.stringify(fleet));
      }
    }

    // Show losses
    if (b.attacker_losses) console.log('\nAttacker losses:', JSON.stringify(b.attacker_losses));
    if (b.defender_losses) console.log('Defender losses:', JSON.stringify(b.defender_losses));
    
    // Show result
    if (b.result) console.log('Result:', b.result);
    if (b.rounds) console.log('Rounds:', Array.isArray(b.rounds) ? b.rounds.length : b.rounds);

    // Show full body keys to understand structure
    console.log('\nBody keys:', Object.keys(b));
    console.log('');
  }

  await c.end();
})();
