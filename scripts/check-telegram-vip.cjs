const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  // 1. All message types
  const r1 = await c.query(`SELECT message_type, COUNT(*) as cnt FROM messages GROUP BY message_type ORDER BY cnt DESC`);
  console.log('=== MESSAGE TYPES ===');
  console.table(r1.rows);

  // 2. Recent messages to telegram-linked users with VIP status
  const r2 = await c.query(`
    SELECT m.message_type, LEFT(m.subject, 50) as subject, m.created_at::text,
           p.username as recipient,
           CASE WHEN ps.id IS NOT NULL AND ps.is_active AND ps.expires_at > now() THEN 'VIP' ELSE 'NO-VIP' END as vip_status
    FROM messages m
    JOIN profiles p ON p.id = m.recipient_id
    LEFT JOIN plus_subscriptions ps ON ps.user_id = m.recipient_id
    WHERE m.created_at > now() - interval '3 days'
    AND EXISTS(SELECT 1 FROM telegram_links tl WHERE tl.user_id = m.recipient_id AND tl.telegram_id IS NOT NULL)
    ORDER BY m.created_at DESC
    LIMIT 40
  `);
  console.log('\n=== RECENT MSGS TO TELEGRAM-LINKED USERS (last 3 days) ===');
  console.table(r2.rows);

  // 3. Check current trigger function source
  const r3 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'notify_telegram_dm_on_message'
  `);
  console.log('\n=== CURRENT TRIGGER FUNCTION SOURCE ===');
  console.log(r3.rows[0]?.prosrc || 'NOT FOUND');

  // 4. Check plus_subscriptions structure
  const r4 = await c.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_name = 'plus_subscriptions' ORDER BY ordinal_position
  `);
  console.log('\n=== plus_subscriptions COLUMNS ===');
  console.table(r4.rows);

  // 5. All telegram-linked users with VIP status
  const r5 = await c.query(`
    SELECT p.username, tl.telegram_id,
           CASE WHEN ps.id IS NOT NULL AND ps.is_active AND ps.expires_at > now() THEN 'VIP' ELSE 'NO-VIP' END as vip_status,
           ps.expires_at::text
    FROM telegram_links tl
    JOIN profiles p ON p.id = tl.user_id
    LEFT JOIN plus_subscriptions ps ON ps.user_id = tl.user_id
    WHERE tl.telegram_id IS NOT NULL
    ORDER BY vip_status, p.username
  `);
  console.log('\n=== ALL TELEGRAM-LINKED USERS ===');
  console.table(r5.rows);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
