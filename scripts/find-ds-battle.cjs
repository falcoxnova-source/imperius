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

  // 1. List recent battles
  console.log('=== RECENT BATTLES ===');
  const battles = await c.query(`
    SELECT m.id, m.subject, m.created_at, m.sender_id, m.recipient_id,
           length(m.body::text) as body_size
    FROM messages m
    WHERE m.message_type = 'battle'
    ORDER BY m.created_at DESC
    LIMIT 10
  `);
  console.table(battles.rows);

  // 2. Find battles with Estrella / death_star / Muerte in body
  console.log('\n=== BATTLES WITH ESTRELLA/DEATH ===');
  const dsb = await c.query(`
    SELECT m.id, m.subject, m.created_at, length(m.body::text) as body_size
    FROM messages m
    WHERE m.message_type = 'battle'
      AND (m.body::text LIKE '%Estrella%' OR m.body::text LIKE '%death_star%' OR m.body::text LIKE '%Muerte%')
    ORDER BY m.created_at DESC
    LIMIT 5
  `);
  console.log('Found:', dsb.rows.length);
  if (dsb.rows.length > 0) console.table(dsb.rows);

  // 3. Read the most recent battle body (first 2000 chars)
  if (battles.rows.length > 0) {
    const latest = await c.query(`SELECT body FROM messages WHERE id = $1`, [battles.rows[0].id]);
    const body = latest.rows[0].body;
    console.log('\n=== LATEST BATTLE BODY STRUCTURE ===');
    console.log('Keys:', Object.keys(body));
    console.log('Body (truncated):', JSON.stringify(body).substring(0, 3000));
  }

  // 4. Check attack_log for death stars
  console.log('\n=== ATTACK LOG (recent) ===');
  const attacks = await c.query(`
    SELECT al.id, al.created_at, 
           p_att.username as attacker, 
           p_def.username as defender,
           al.attacker_fleet, al.defender_fleet,
           al.result
    FROM attack_log al
    LEFT JOIN profiles p_att ON p_att.id = al.attacker_id
    LEFT JOIN profiles p_def ON p_def.id = al.defender_id
    ORDER BY al.created_at DESC
    LIMIT 10
  `);
  if (attacks.rows.length > 0) {
    console.table(attacks.rows.map(r => ({
      ...r,
      attacker_fleet: JSON.stringify(r.attacker_fleet).substring(0, 100),
      defender_fleet: JSON.stringify(r.defender_fleet).substring(0, 100)
    })));
  }

  await c.end();
})();
