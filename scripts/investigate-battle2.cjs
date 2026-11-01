const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function investigate() {
  await c.connect();

  // 1. Search by debris values from the report: 5883900 Metal, 3180900 Crystal
  console.log('=== SEARCH BY DEBRIS VALUES ===');
  const byDebris = await c.query(`
    SELECT br.id, br.coordinates, br.result, br.rounds,
           br.debris_metal, br.debris_crystal,
           br.loot_metal, br.loot_crystal, br.loot_deuterium,
           br.created_at,
           pa.username as attacker, pd.username as defender
    FROM battle_reports br
    LEFT JOIN profiles pa ON br.attacker_id = pa.id
    LEFT JOIN profiles pd ON br.defender_id = pd.id
    WHERE br.debris_metal = 5883900 OR br.loot_metal = 1787565
    ORDER BY br.created_at DESC LIMIT 5
  `);
  console.table(byDebris.rows);

  // 2. Search all recent battles (last 2 days)
  console.log('\n=== RECENT BATTLES (last 2 days) ===');
  const recent = await c.query(`
    SELECT br.id, br.coordinates, br.result, br.rounds,
           br.debris_metal, br.debris_crystal,
           br.loot_metal, br.loot_crystal, br.loot_deuterium,
           br.created_at,
           pa.username as attacker, pd.username as defender
    FROM battle_reports br
    LEFT JOIN profiles pa ON br.attacker_id = pa.id
    LEFT JOIN profiles pd ON br.defender_id = pd.id
    WHERE br.created_at >= NOW() - INTERVAL '2 days'
    ORDER BY br.created_at DESC LIMIT 20
  `);
  console.table(recent.rows);

  // 3. Search messages for "Ronaldo" or battle reports
  console.log('\n=== BATTLE MESSAGES (last 2 days) ===');
  const msgs = await c.query(`
    SELECT m.id, m.recipient_id, pr.username as recipient, m.subject, m.message_type,
           m.created_at,
           LEFT(m.body, 200) as body_preview
    FROM messages m
    LEFT JOIN profiles pr ON m.recipient_id = pr.id
    WHERE m.message_type = 'battle'
    AND m.created_at >= NOW() - INTERVAL '2 days'
    ORDER BY m.created_at DESC LIMIT 20
  `);
  msgs.rows.forEach(m => {
    console.log(`\n[${m.created_at}] To: ${m.recipient} | ${m.subject}`);
    console.log(`  ${m.body_preview}`);
  });

  // 4. Find user "Ronaldo" or similar
  console.log('\n=== PROFILES SEARCH ===');
  const profiles = await c.query(`
    SELECT id, username, email FROM profiles 
    WHERE username ILIKE '%ronal%' OR username ILIKE '%jenni%'
    LIMIT 10
  `);
  console.table(profiles.rows);

  // 5. Recent ACS fleets
  console.log('\n=== RECENT ACS FLEETS ===');
  const acs = await c.query(`
    SELECT af.id, af.status, af.is_active, af.current_participants, 
           af.target_galaxy, af.target_system, af.target_position,
           af.arrival_time, af.created_at
    FROM acs_fleets af
    WHERE af.created_at >= NOW() - INTERVAL '5 days'
    ORDER BY af.created_at DESC LIMIT 10
  `);
  console.table(acs.rows);

  await c.end();
}

investigate().catch(e => { console.error(e); process.exit(1); });
