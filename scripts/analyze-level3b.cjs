const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*',
    database: 'postgres',
  });

  await client.connect();
  console.log('Connected.\n');

  const queries = [
    { label: '1. battle_reports structure', sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'battle_reports' ORDER BY ordinal_position` },
    { label: '2. fleets structure', sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fleets' ORDER BY ordinal_position` },
    { label: '3. mission types', sql: `SELECT DISTINCT mission_type FROM fleets LIMIT 20` },
    { label: '4. sample bot planets', sql: `SELECT id, planet_id, user_id FROM planets WHERE user_id IN (SELECT id FROM profiles WHERE is_bot = true) LIMIT 5` },
    { label: '5. bot fleet activity', sql: `SELECT COUNT(*) as fleet_count, p.user_id FROM fleets f JOIN planets p ON f.origin_planet_id = p.id WHERE p.user_id IN (SELECT id FROM profiles WHERE is_bot = true) GROUP BY p.user_id LIMIT 5` },
    { label: '6. bot_ai_tick function body', sql: `SELECT prosrc FROM pg_proc WHERE proname = 'bot_ai_tick'` },
  ];

  for (const q of queries) {
    console.log(`=== ${q.label} ===`);
    try {
      const res = await client.query(q.sql);
      if (res.rows.length === 0) {
        console.log('(no rows)');
      } else {
        for (const row of res.rows) {
          // For prosrc (function body), print full text
          if (row.prosrc !== undefined) {
            console.log(row.prosrc);
          } else {
            console.log(JSON.stringify(row));
          }
        }
      }
    } catch (e) {
      console.log('ERROR:', e.message);
    }
    console.log('');
  }

  await client.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
