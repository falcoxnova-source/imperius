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

  // Get all battle reports mentioning Estrella de la Muerte
  const dsb = await c.query(`
    SELECT m.id, m.created_at, m.recipient_id, m.body::text as body_text
    FROM messages m
    WHERE m.message_type = 'battle'
      AND (m.body::text LIKE '%Estrella%' OR m.body::text LIKE '%death_star%' OR m.body::text LIKE '%deathstar%')
    ORDER BY m.created_at DESC
    LIMIT 10
  `);

  console.log('Found', dsb.rows.length, 'battle reports with Death Stars\n');

  for (const row of dsb.rows) {
    console.log('='.repeat(80));
    console.log('Date:', row.created_at);
    console.log('Recipient:', row.recipient_id);
    console.log('\nFull report:');
    console.log(row.body_text);
    console.log('');
  }

  await c.end();
})();
