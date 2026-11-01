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
  r1.rows.forEach(r => console.log(`  ${r.message_type}: ${r.cnt}`));

  // 2. Current function source from pg_proc
  const r3 = await c.query(`
    SELECT prosrc FROM pg_proc WHERE proname = 'notify_telegram_dm_on_message'
  `);
  console.log('\n=== CURRENT TRIGGER FUNCTION (from pg_proc) ===');
  console.log(r3.rows[0]?.prosrc || 'NOT FOUND');

  // 3. VIP users count
  const r4 = await c.query(`SELECT COUNT(*) FROM plus_subscriptions WHERE is_active = true AND expires_at > now()`);
  console.log('\n=== ACTIVE VIP COUNT ===', r4.rows[0].count);

  // 4. Telegram-linked users count
  const r5 = await c.query(`SELECT COUNT(*) FROM telegram_links WHERE telegram_id IS NOT NULL`);
  console.log('=== TELEGRAM-LINKED USERS COUNT ===', r5.rows[0].count);

  // 5. Recent messages to NON-VIP telegram users
  const r6 = await c.query(`
    SELECT m.message_type, LEFT(m.subject, 60) as subject, m.created_at::text, p.username
    FROM messages m
    JOIN profiles p ON p.id = m.recipient_id
    WHERE m.created_at > now() - interval '1 day'
    AND EXISTS(SELECT 1 FROM telegram_links tl WHERE tl.user_id = m.recipient_id AND tl.telegram_id IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM plus_subscriptions ps WHERE ps.user_id = m.recipient_id AND ps.is_active = true AND ps.expires_at > now())
    ORDER BY m.created_at DESC
    LIMIT 20
  `);
  console.log('\n=== RECENT MSGS TO NON-VIP TELEGRAM USERS (last 24h) ===');
  r6.rows.forEach(r => console.log(`  [${r.message_type}] ${r.username}: ${r.subject} (${r.created_at})`));

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
