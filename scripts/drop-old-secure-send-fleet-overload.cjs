const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await c.connect();
  await c.query("DROP FUNCTION IF EXISTS secure_send_fleet(uuid, int, int, int, text, jsonb, int, bigint, bigint, bigint, text, uuid);");
  console.log('OLD_OVERLOAD_DROPPED');
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
