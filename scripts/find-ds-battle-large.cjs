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
  
  // Search for battle reports with many Death Stars
  const res = await client.query(`
    SELECT m.id, m.created_at, m.recipient_id,
           m.body,
           u.username as recipient_name
    FROM messages m
    LEFT JOIN profiles u ON u.id = m.recipient_id
    WHERE m.type = 'battle_report'
    AND m.body LIKE '%Estrella de la Muerte%'
    ORDER BY m.created_at DESC
    LIMIT 100
  `);
  
  console.log('Found', res.rows.length, 'battle reports with Death Stars');
  
  // Parse each to find ones with large DS numbers
  for (const r of res.rows) {
    const body = r.body;
    // Find all mentions of "Estrella de la Muerte: X"
    const dsMatches = body.match(/Estrella de la Muerte:\s*(\d+)/g);
    if (dsMatches) {
      const numbers = dsMatches.map(m => parseInt(m.match(/(\d+)/)[1]));
      const maxDS = Math.max(...numbers);
      if (maxDS >= 5) {
        console.log('\n' + '='.repeat(80));
        console.log('Date:', r.created_at, '| To:', r.recipient_name);
        console.log('DS counts found:', numbers);
        console.log('\nFull report:');
        console.log(body);
      }
    }
  }
  
  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
