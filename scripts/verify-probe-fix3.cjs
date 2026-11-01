const { Client } = require('pg');

const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await c.connect();

  const { rows } = await c.query(`
    SELECT prosrc FROM pg_proc 
    WHERE proname = 'secure_send_fleet'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ORDER BY oid DESC LIMIT 1
  `);

  const src = rows[0].prosrc;
  const hasNewFix = src.includes('No puedes atacar solo con sondas de espionaje');
  const hasOldBug = src.includes('Attack requires at least one combat ship with weapons');
  
  console.log('New fix present:', hasNewFix);
  console.log('Old bug removed:', !hasOldBug);

  const idx = src.indexOf('Block attack with only espionage probes');
  if (idx >= 0) {
    console.log('\n--- Current validation ---');
    console.log(src.substring(idx, idx + 350));
  }

  await c.end();
}

main().catch(e => { console.error(e.message); c.end(); });
