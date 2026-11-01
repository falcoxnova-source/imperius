const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Search ALL messages with Estrella de la Muerte - no filter on type
  const res = await client.query(`
    SELECT m.id, m.created_at, m.recipient_id, m.subject, m.message_type,
           m.body,
           p.username as recipient_name
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.recipient_id
    WHERE m.body LIKE '%Estrella de la Muerte%'
    ORDER BY m.created_at DESC
    LIMIT 500
  `);
  
  console.log('Found', res.rows.length, 'messages mentioning Estrella de la Muerte');
  
  // Parse and find large DS battles
  let found = 0;
  for (const r of res.rows) {
    const body = r.body || '';
    const dsMatches = body.match(/Estrella de la Muerte:\s*(\d+)/g);
    if (dsMatches) {
      const numbers = dsMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
      const maxDS = Math.max(...numbers);
      if (maxDS >= 10) {
        found++;
        console.log('\n' + '='.repeat(80));
        console.log('Date:', r.created_at, '| To:', r.recipient_name);
        console.log('Subject:', r.subject, '| Type:', r.message_type);
        console.log('DS counts found:', numbers);
        console.log('\nFull report:');
        console.log(body);
        console.log('='.repeat(80));
      }
    }
  }
  
  if (found === 0) {
    console.log('\nNo battles with 10+ DS found. Showing all DS battles:');
    for (const r of res.rows) {
      const body = r.body || '';
      const dsMatches = body.match(/Estrella de la Muerte:\s*(\d+)/g);
      if (dsMatches) {
        const numbers = dsMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
        console.log('  Date:', r.created_at, '| To:', r.recipient_name, '| DS:', numbers, '| Type:', r.message_type);
      }
    }
  }
  
  // Also check if there are "Destruccion Masiva" battles that might be confused with DS
  const res2 = await client.query(`
    SELECT COUNT(*) as cnt FROM messages WHERE body LIKE '%Destruccion Masiva%'
  `);
  console.log('\nMessages mentioning Destruccion Masiva:', res2.rows[0].cnt);
  
  // Check total battle reports
  const res3 = await client.query(`
    SELECT message_type, COUNT(*) as cnt FROM messages GROUP BY message_type ORDER BY cnt DESC
  `);
  console.log('\nMessage types:');
  res3.rows.forEach(r => console.log('  ', r.message_type, ':', r.cnt));
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
