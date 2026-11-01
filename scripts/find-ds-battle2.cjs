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
  
  // Check messages table structure
  const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='messages' ORDER BY ordinal_position`);
  console.log('Messages columns:');
  cols.rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type})`));
  
  // Search for all battle reports with Death Stars
  const res = await client.query(`
    SELECT m.id, m.created_at, m.recipient_id, m.subject,
           m.body,
           p.username as recipient_name
    FROM messages m
    LEFT JOIN profiles p ON p.id = m.recipient_id
    WHERE m.subject LIKE '%combate%' OR m.subject LIKE '%batalla%' OR m.subject LIKE '%ataque%' OR m.subject LIKE '%battle%'
    ORDER BY m.created_at DESC
    LIMIT 200
  `);
  
  console.log('\nFound', res.rows.length, 'battle-related messages');
  
  // Filter for those with Death Stars with large counts
  for (const r of res.rows) {
    const body = r.body || '';
    if (!body.includes('Estrella de la Muerte')) continue;
    
    const dsMatches = body.match(/Estrella de la Muerte:\s*(\d+)/g);
    if (dsMatches) {
      const numbers = dsMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
      const maxDS = Math.max(...numbers);
      if (maxDS >= 5) {
        console.log('\n' + '='.repeat(80));
        console.log('Date:', r.created_at, '| To:', r.recipient_name, '| Subject:', r.subject);
        console.log('DS counts found:', numbers);
        console.log('\nFull report:');
        console.log(body.substring(0, 3000));
      }
    }
  }
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
