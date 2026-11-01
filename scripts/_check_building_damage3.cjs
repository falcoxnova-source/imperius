const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: process.env.SUPABASE_DB_PASSWORD || 'Jfs.samsung1989*',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  const r = await c.query(`
    SELECT created_at, body
    FROM messages
    WHERE message_type = 'battle'
      AND created_at > now() - interval '3 days'
      AND body ILIKE '%infraestructura%'
    ORDER BY created_at DESC
    LIMIT 3
  `);
  console.log(`Found ${r.rows.length} battle reports mentioning damage:`);
  r.rows.forEach((row, i) => {
    console.log(`\n=== Message ${i+1} (${row.created_at}) ===`);
    console.log(row.body);
    console.log('---');
  });

  // Count: how many battles in last 3 days vs how many had damage
  const r2 = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE body ILIKE '%infraestructura%') AS with_damage,
      COUNT(*) AS total
    FROM messages
    WHERE message_type = 'battle' AND created_at > now() - interval '3 days'
  `);
  console.log(`\nBattles last 3 days: ${r2.rows[0].total}, with infrastructure damage: ${r2.rows[0].with_damage}`);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
