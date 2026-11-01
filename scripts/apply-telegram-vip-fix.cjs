const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

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

  // Read and apply migration
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20260401_fix_vip_only_all_telegram_notifications.sql'),
    'utf8'
  );
  
  console.log('Applying migration...');
  await c.query(sql);
  console.log('✅ Migration applied successfully!');

  // Verify the function was updated
  const r = await c.query(`SELECT prosrc FROM pg_proc WHERE proname = 'notify_telegram_dm_on_message'`);
  const src = r.rows[0]?.prosrc || '';
  
  // Check that the new logic is there
  if (src.includes("v_msg_type <> 'broadcast'")) {
    console.log('✅ Verified: Function now blocks ALL types except broadcast for non-VIP users');
  } else {
    console.log('❌ ERROR: Function does not contain expected VIP check logic');
    console.log('Source:', src.substring(0, 500));
  }

  // Show summary
  const vip = await c.query(`SELECT COUNT(*) FROM plus_subscriptions WHERE is_active = true AND expires_at > now()`);
  const tg = await c.query(`SELECT COUNT(*) FROM telegram_links WHERE telegram_id IS NOT NULL`);
  console.log(`\n📊 Summary:`);
  console.log(`   Telegram-linked users: ${tg.rows[0].count}`);
  console.log(`   Active VIP users: ${vip.rows[0].count}`);
  console.log(`   Non-VIP users that will NO LONGER get DMs: ${tg.rows[0].count - vip.rows[0].count}`);
  console.log(`   Only broadcast (admin) messages will still reach all users`);

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
