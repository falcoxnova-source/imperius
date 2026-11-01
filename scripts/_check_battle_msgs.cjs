const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  // Get defender battle messages
  const r = await c.query(`
    SELECT id, subject, substring(body,1,800) as body_preview, created_at 
    FROM messages 
    WHERE message_type='battle' AND body LIKE '%fue atacado%' 
    ORDER BY created_at DESC LIMIT 3
  `);
  console.log('=== DEFENDER BATTLE MESSAGES ===');
  for (const row of r.rows) {
    console.log('\n--- Message:', row.subject, '---');
    console.log('Date:', row.created_at);
    console.log(row.body_preview);
  }

  // Get attacker battle messages  
  const r2 = await c.query(`
    SELECT id, subject, substring(body,1,800) as body_preview, created_at 
    FROM messages 
    WHERE message_type='battle' AND body LIKE '%Tu flota%' 
    ORDER BY created_at DESC LIMIT 3
  `);
  console.log('\n\n=== ATTACKER BATTLE MESSAGES ===');
  for (const row of r2.rows) {
    console.log('\n--- Message:', row.subject, '---');
    console.log('Date:', row.created_at);
    console.log(row.body_preview);
  }

  c.end();
}).catch(e => { console.error(e); c.end(); });
