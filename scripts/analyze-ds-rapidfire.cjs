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

  // Get Death Star full rapid fire
  const ds = await c.query(`SELECT rapid_fire FROM ship_types WHERE code = 'deathstar'`);
  console.log('=== DEATH STAR RAPID FIRE ===');
  console.log(JSON.stringify(ds.rows[0].rapid_fire, null, 2));

  // Check if death_star has RF against itself
  const rf = ds.rows[0].rapid_fire;
  console.log('\nRF vs deathstar:', rf.deathstar || rf.death_star || 'NONE');
  console.log('RF vs battleship:', rf.battleship || 'NONE');

  // Also get the latest battle reports involving death stars to see real combat
  console.log('\n=== RECENT BATTLE REPORTS WITH DEATH STARS ===');
  const reports = await c.query(`
    SELECT m.id, m.subject, m.created_at, 
           m.body->>'attacker_name' as attacker,
           m.body->>'defender_name' as defender,
           m.body->>'rounds' as round_count
    FROM messages m
    WHERE m.message_type = 'battle'
      AND m.body::text LIKE '%deathstar%'
    ORDER BY m.created_at DESC
    LIMIT 5
  `);
  
  if (reports.rows.length > 0) {
    console.table(reports.rows);
    
    // Get the most recent one's full body
    const latest = await c.query(`
      SELECT m.body
      FROM messages m
      WHERE m.message_type = 'battle'
        AND m.body::text LIKE '%deathstar%'
      ORDER BY m.created_at DESC
      LIMIT 1
    `);
    
    if (latest.rows.length > 0) {
      const body = latest.rows[0].body;
      console.log('\n=== LATEST BATTLE DETAIL ===');
      console.log('Attacker:', body.attacker_name);
      console.log('Defender:', body.defender_name);
      console.log('Result:', body.result);
      console.log('Rounds:', body.rounds?.length || 'N/A');
      
      if (body.attacker_ships) {
        console.log('\nAttacker fleet:');
        console.table(body.attacker_ships);
      }
      if (body.defender_ships) {
        console.log('\nDefender fleet:');
        console.table(body.defender_ships);
      }
      if (body.attacker_losses) console.log('Attacker losses:', JSON.stringify(body.attacker_losses));
      if (body.defender_losses) console.log('Defender losses:', JSON.stringify(body.defender_losses));
    }
  } else {
    console.log('No battle reports with death stars found');
  }

  await c.end();
})();
