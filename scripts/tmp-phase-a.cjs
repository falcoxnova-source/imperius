const { Client } = require('pg');
const c = new Client({host:'aws-1-eu-north-1.pooler.supabase.com',port:6543,user:'postgres.hhrgcnvydmjqcevgmlhj',password:'Jfs.samsung1989*',database:'postgres',ssl:{rejectUnauthorized:false}});
c.connect().then(async()=>{
  const r = await c.query("SELECT prosrc FROM pg_proc WHERE proname='bot_ai_tick'");
  const src = r.rows[0].prosrc;
  const lines = src.split('\n');
  
  // Print Phase A: Buildings section (lines ~220-320)
  console.log('=== PHASE A: BUILDINGS (lines 220-330) ===');
  for (let i = 220; i < Math.min(330, lines.length); i++) {
    console.log(`${i}: ${lines[i]}`);
  }
  
  // Check if officer_types / user_officers tables exist
  console.log('\n=== OFFICER TABLES ===');
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%officer%' ORDER BY table_name");
  console.log(tables.rows.map(r=>r.table_name));
  
  // Check officer_types
  const otypes = await c.query("SELECT code FROM officer_types ORDER BY code");
  console.log('Officer types:', otypes.rows.map(r=>r.code));
  
  // Check if any NPC has officers
  const npcOfficers = await c.query(`
    SELECT p.username, ot.code, uo.expires_at
    FROM user_officers uo
    JOIN profiles p ON p.id = uo.user_id
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE p.is_bot = true
    LIMIT 10
  `);
  console.log('NPC officers:', npcOfficers.rows);

  await c.end();
});
