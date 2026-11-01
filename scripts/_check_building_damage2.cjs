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

  const r = await c.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'process_fleet_arrival'`);
  const src = r.rows[0].def.replace(/\r\n/g, '\n');

  // Extract context around building damage
  const idx = src.indexOf('building_damage');
  if (idx > 0) {
    console.log('--- Context around building damage (first occurrence) ---');
    console.log(src.substring(Math.max(0, idx - 200), idx + 3000));
  }

  // Check recent battle messages for damage text
  console.log('\n\n--- Recent battle messages with damage info ---');
  const r2 = await c.query(`
    SELECT id, created_at, LEFT(body, 300) AS preview
    FROM messages
    WHERE message_type = 'battle'
      AND created_at > now() - interval '3 days'
      AND (body ILIKE '%infraestructura%' OR body ILIKE '%nivel%' OR body ILIKE '%Dano%' OR body ILIKE '%da\u00f1o%')
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log(`Found ${r2.rows.length} battle messages with damage info in last 3 days`);
  r2.rows.forEach(row => console.log(row.created_at, '|', row.preview));

  // Check total battle messages last 3 days
  const r3 = await c.query(`SELECT COUNT(*) FROM messages WHERE message_type = 'battle' AND created_at > now() - interval '3 days'`);
  console.log(`Total battle messages last 3 days: ${r3.rows[0].count}`);

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
