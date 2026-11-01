/**
 * Give all non-bot accounts a 7-day FREE trial of the Android officer.
 * After the 7 days expire, bot_ai_tick auto-deactivates autopilot via the cleanup block.
 */
const { Client } = require('pg');

const DB = {
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

(async () => {
  const client = new Client(DB);
  await client.connect();
  console.log('Connected.');

  // 1) Get android officer type id
  const { rows: [officer] } = await client.query(
    `SELECT id FROM officer_types WHERE code = 'android' LIMIT 1`
  );
  if (!officer) {
    console.error('ERROR: officer_types with code="android" not found!');
    await client.end();
    process.exit(1);
  }
  console.log('Android officer id:', officer.id);

  // 2) Insert or update android officer for ALL non-bot users, 7-day expiry from NOW
  const result = await client.query(`
    INSERT INTO user_officers (user_id, officer_type_id, expires_at)
    SELECT p.id, $1, NOW() + INTERVAL '7 days'
    FROM profiles p
    WHERE p.is_bot = false
    ON CONFLICT (user_id, officer_type_id)
    DO UPDATE SET expires_at = GREATEST(user_officers.expires_at, NOW() + INTERVAL '7 days')
  `, [officer.id]);

  console.log(`✅ Android officer (7-day trial) granted to ${result.rowCount} accounts.`);

  // 3) Verify
  const { rows: [count] } = await client.query(`
    SELECT COUNT(*) AS total
    FROM user_officers uo
    JOIN officer_types ot ON ot.id = uo.officer_type_id
    WHERE ot.code = 'android' AND uo.expires_at > NOW()
  `);
  console.log(`Total active android officers: ${count.total}`);

  await client.end();
})().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
