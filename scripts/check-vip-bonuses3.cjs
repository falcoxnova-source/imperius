const { Client } = require('pg');
async function main() {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    database: 'postgres', user: 'postgres.hhrgcnvydmjqcevgmlhj',
    password: 'Jfs.samsung1989*', ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // 1) Get FULL secure_send_fleet - need to see if VIP flight time bonus is applied
  console.log('=== secure_send_fleet FULL ===');
  const fn1 = await c.query("SELECT prosrc FROM pg_proc WHERE proname='secure_send_fleet' LIMIT 1");
  if (fn1.rows.length) console.log(fn1.rows[0].prosrc);

  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
