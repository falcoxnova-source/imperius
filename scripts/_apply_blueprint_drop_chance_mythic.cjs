process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  await c.query("UPDATE expedition_blueprint_drop_config SET drop_chance = 0.0001, updated_at = now() WHERE id = 1");
  console.table((await c.query('SELECT id, drop_chance, only_unowned, is_enabled, updated_at FROM expedition_blueprint_drop_config WHERE id=1')).rows);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
