process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log('--- CONFIG ACTUAL ---');
  console.table((await c.query('SELECT id, drop_chance, only_unowned, is_enabled, updated_at FROM expedition_blueprint_drop_config WHERE id=1')).rows);

  console.log('--- TRIGGER ACTIVO ---');
  console.table((await c.query("SELECT tgname, tgenabled FROM pg_trigger WHERE tgname='trg_award_expedition_blueprint_drop'")).rows);

  console.log('--- FUNCION (primeras lineas) ---');
  const fn = (await c.query("SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname='award_expedition_blueprint_drop'")).rows;
  if (fn.length) console.log(fn[0].def.split('\n').slice(0, 30).join('\n'));

  console.log('--- DROPS ANTES vs DESPUES del cambio (cutoff 2026-04-26 13:53 UTC) ---');
  console.table((await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE dropped_at < '2026-04-26 13:53:41'::timestamptz) AS antes,
      COUNT(*) FILTER (WHERE dropped_at >= '2026-04-26 13:53:41'::timestamptz) AS despues_001,
      COUNT(*) FILTER (WHERE dropped_at >= '2026-04-26 13:57:11'::timestamptz) AS despues_mitico
    FROM expedition_blueprint_drops
  `)).rows);

  console.log('--- ULTIMOS 10 DROPS REGISTRADOS ---');
  console.table((await c.query(`
    SELECT d.dropped_at, p.username, bp.code, d.roll_value, d.chance_used
    FROM expedition_blueprint_drops d
    JOIN ship_blueprints bp ON bp.id=d.blueprint_id
    LEFT JOIN profiles p ON p.id=d.user_id
    ORDER BY d.dropped_at DESC LIMIT 10
  `)).rows);

  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
