const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  const cfg = await client.query(`SELECT drop_chance, is_enabled FROM expedition_blueprint_drop_config WHERE id = 1`);
  const bps = await client.query(`SELECT code, name, drop_cooldown_seconds, last_drop_at, is_active FROM ship_blueprints ORDER BY code`);

  const exp7 = await client.query(`
    SELECT COUNT(*)::int AS c
    FROM fleets
    WHERE mission_type = 'expedition'
      AND is_completed = true
      AND created_at >= now() - interval '7 days'
  `);
  const exp1 = await client.query(`
    SELECT COUNT(*)::int AS c
    FROM fleets
    WHERE mission_type = 'expedition'
      AND is_completed = true
      AND created_at >= now() - interval '1 day'
  `);

  console.log('=== Config ===');
  console.log(cfg.rows[0]);
  console.log('=== Blueprints ===');
  console.log(bps.rows);
  console.log('=== Expediciones completadas ===');
  console.log('Ultimas 24h:', exp1.rows[0].c);
  console.log('Ultimos 7d :', exp7.rows[0].c);

  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
