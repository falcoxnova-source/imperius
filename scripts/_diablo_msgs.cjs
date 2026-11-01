const { Client } = require('pg');
const c = new Client({ host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543, user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*', database: 'postgres', ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();

  // Find diablo user
  const u = await c.query(`SELECT id, email, username FROM profiles WHERE email ILIKE '%diablo%' OR username ILIKE '%diablo%' LIMIT 5`);
  console.log('User(s) found:');
  console.table(u.rows);
  if (u.rows.length === 0) { await c.end(); return; }

  const uid = u.rows[0].id;

  // Count messages by type & subject in last 48h
  const stats = await c.query(`
    SELECT message_type, subject, COUNT(*) as cnt,
           MIN(created_at) as first_at, MAX(created_at) as last_at
    FROM messages
    WHERE recipient_id = $1
      AND created_at >= NOW() - interval '48 hours'
    GROUP BY message_type, subject
    ORDER BY cnt DESC
    LIMIT 20
  `, [uid]);
  console.log('\nTop message groups last 48h:');
  console.table(stats.rows);

  // Sample bodies from the most frequent subject
  if (stats.rows.length > 0) {
    const top = stats.rows[0];
    const samples = await c.query(`
      SELECT created_at, substring(body, 1, 200) as body_preview
      FROM messages
      WHERE recipient_id = $1 AND subject = $2
      ORDER BY created_at DESC
      LIMIT 5
    `, [uid, top.subject]);
    console.log(`\nSample bodies for "${top.subject}":`);
    samples.rows.forEach(r => console.log(`[${r.created_at}] ${r.body_preview}`));
  }

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
