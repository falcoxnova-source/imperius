const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,database:'postgres',user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',ssl:{rejectUnauthorized:false}});

async function main() {
  await c.connect();

  // Bug #1: Check perform_combat for 'deploy' vs 'hold'
  const r1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_combat'");
  if (r1.rows.length) {
    const src = r1.rows[0].prosrc;
    const holdMatch = src.match(/mission_type\s*=\s*'hold'/g);
    const deployMatch = src.match(/mission_type\s*=\s*'deploy'/g);
    console.log('=== BUG #1: perform_combat ===');
    console.log('Contains mission_type = hold:', holdMatch ? holdMatch.length + ' matches' : 'NO');
    console.log('Contains mission_type = deploy:', deployMatch ? deployMatch.length + ' matches' : 'NO');
    
    const alliedSection = src.includes('ALLIED') || src.includes('allied') || src.includes('ally');
    console.log('Has allied fleet section:', alliedSection);
  } else {
    console.log('perform_combat NOT FOUND');
  }

  // Check perform_acs_combat
  const r1b = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'perform_acs_combat'");
  if (r1b.rows.length) {
    const src = r1b.rows[0].prosrc;
    const alliedSection = src.includes('allied') || src.includes('ALLIED') || src.includes('deploy');
    console.log('\n=== perform_acs_combat ===');
    console.log('Has allied fleet section:', alliedSection);
  } else {
    console.log('\nperform_acs_combat NOT FOUND');
  }

  // Bug #2: Check expedition branch in process_fleet_arrival  
  const r2 = await c.query("SELECT prosrc FROM pg_proc WHERE proname = 'process_fleet_arrival'");
  if (r2.rows.length) {
    const src = r2.rows[0].prosrc;
    const expIdx = src.indexOf("'expedition'");
    if (expIdx > -1) {
      // Get context around the expedition branch
      const start = Math.max(0, expIdx - 50);
      const expSection = src.substring(start, expIdx + 1000);
      console.log('\n=== BUG #2: process_fleet_arrival expedition branch ===');
      console.log(expSection.substring(0, 1200));
    }
  }

  // Count expedition messages per user recently
  const r3 = await c.query(`
    SELECT recipient_id, COUNT(*) as msg_count, 
           COUNT(DISTINCT body) as unique_bodies
    FROM messages 
    WHERE message_type = 'expedition' 
      AND created_at > NOW() - INTERVAL '3 days'
    GROUP BY recipient_id
    ORDER BY msg_count DESC
    LIMIT 5
  `);
  console.log('\n=== Recent expedition messages (last 3 days) ===');
  r3.rows.forEach(r => console.log('User:', r.recipient_id, '| Messages:', r.msg_count, '| Unique bodies:', r.unique_bodies));

  // Check for duplicate expedition messages (same user, close timestamps)
  const r4 = await c.query(`
    SELECT m1.recipient_id, m1.subject as subj1, 
           LEFT(m1.body, 100) as body1, m1.created_at as t1,
           m2.subject as subj2, LEFT(m2.body, 100) as body2, m2.created_at as t2
    FROM messages m1
    JOIN messages m2 ON m1.recipient_id = m2.recipient_id 
      AND m2.created_at BETWEEN m1.created_at AND m1.created_at + INTERVAL '10 seconds'
      AND m2.id > m1.id
      AND m2.message_type = 'expedition'
    WHERE m1.message_type = 'expedition'
      AND m1.created_at > NOW() - INTERVAL '3 days'
    ORDER BY m1.created_at DESC
    LIMIT 8
  `);
  console.log('\n=== Duplicate expedition pairs (within 10s) ===');
  r4.rows.forEach(r => {
    console.log('---');
    console.log('  Msg1:', r.subj1, '|', r.body1);
    console.log('  Msg2:', r.subj2, '|', r.body2);
    console.log('  Time1:', r.t1, '| Time2:', r.t2);
  });

  // Also check total expedition fleets vs messages
  const r5 = await c.query(`
    SELECT 
      (SELECT COUNT(*) FROM fleets WHERE mission_type = 'expedition' AND is_completed = true AND created_at > NOW() - INTERVAL '3 days') as completed_expeditions,
      (SELECT COUNT(*) FROM messages WHERE message_type = 'expedition' AND created_at > NOW() - INTERVAL '3 days') as expedition_messages
  `);
  console.log('\n=== Expedition fleet vs message count (3 days) ===');
  console.log('Completed expedition fleets:', r5.rows[0].completed_expeditions);
  console.log('Expedition messages:', r5.rows[0].expedition_messages);

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
