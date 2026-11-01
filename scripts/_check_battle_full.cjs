const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  // Get FULL body of a defender battle message where attacker won
  const r = await c.query(`
    SELECT id, subject, body, created_at, recipient_id
    FROM messages 
    WHERE message_type='battle' AND body LIKE '%fue atacado%' AND body LIKE '%VICTORIA ATACANTE%'
    ORDER BY created_at DESC LIMIT 1
  `);
  if (r.rows.length > 0) {
    const msg = r.rows[0];
    console.log('=== FULL DEFENDER MESSAGE (attacker won) ===');
    console.log('Subject:', msg.subject);
    console.log('Date:', msg.created_at);
    console.log('Recipient:', msg.recipient_id);
    console.log('\n--- FULL BODY ---');
    console.log(JSON.stringify(msg.body)); // Show exact string with escapes
    console.log('\n--- RENDERED ---');
    console.log(msg.body);
  }

  // Also get a defender message where defender won
  const r2 = await c.query(`
    SELECT id, subject, body, created_at, recipient_id
    FROM messages 
    WHERE message_type='battle' AND body LIKE '%fue atacado%' AND body LIKE '%VICTORIA DEFENSOR%'
    ORDER BY created_at DESC LIMIT 1
  `);
  if (r2.rows.length > 0) {
    const msg = r2.rows[0];
    console.log('\n\n=== FULL DEFENDER MESSAGE (defender won) ===');
    console.log('Subject:', msg.subject);
    console.log('Date:', msg.created_at);
    console.log('\n--- FULL BODY ---');
    console.log(JSON.stringify(msg.body));
    console.log('\n--- RENDERED ---');
    console.log(msg.body);
  }

  c.end();
}).catch(e => { console.error(e); c.end(); });
