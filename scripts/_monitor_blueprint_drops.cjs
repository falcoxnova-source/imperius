/*
  Monitor de drops de planos en expediciones.
  Muestra:
    - Configuracion actual de la tasa
    - Expediciones completadas vs drops desde el ultimo cambio
    - Tasa REAL observada vs tasa configurada
    - Drops por dia y por hora (ultimas 24h y 7 dias)
    - Top usuarios que mas planos han recibido
    - Ultimos 20 drops registrados

  Uso: node scripts/_monitor_blueprint_drops.cjs
*/

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: 'aws-1-eu-north-1.pooler.supabase.com', port: 6543,
    user: 'postgres.hhrgcnvydmjqcevgmlhj', password: 'Jfs.samsung1989*',
    database: 'postgres', ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const cfg = (await c.query('SELECT id, drop_chance, only_unowned, is_enabled, updated_at FROM expedition_blueprint_drop_config WHERE id=1')).rows[0];
  console.log('\n=== CONFIGURACION ACTUAL ===');
  console.table([cfg]);
  const chance = Number(cfg.drop_chance);
  console.log(`Tasa configurada: ${(chance * 100).toFixed(4)}%  (~1 plano cada ${Math.round(1/chance).toLocaleString()} expediciones)`);
  console.log(`Cambio aplicado: ${cfg.updated_at}`);

  // Expediciones completadas desde el ultimo cambio
  const sinceCfg = (await c.query(
    `SELECT COUNT(*)::int AS expediciones
     FROM fleets
     WHERE mission_type='expedition' AND is_completed=true AND created_at >= $1`,
    [cfg.updated_at]
  )).rows[0].expediciones;

  const dropsSinceCfg = (await c.query(
    'SELECT COUNT(*)::int AS n FROM expedition_blueprint_drops WHERE dropped_at >= $1',
    [cfg.updated_at]
  )).rows[0].n;

  console.log('\n=== DESDE EL ULTIMO CAMBIO DE TASA ===');
  console.table([{
    expediciones_completadas: sinceCfg,
    planos_dropeados: dropsSinceCfg,
    tasa_real_observada: sinceCfg > 0 ? `${((dropsSinceCfg / sinceCfg) * 100).toFixed(4)}%` : 'N/A',
    tasa_configurada: `${(chance * 100).toFixed(4)}%`,
    drops_esperados: (sinceCfg * chance).toFixed(2),
  }]);

  // Drops por dia (ultimos 7 dias)
  console.log('\n=== DROPS POR DIA (ultimos 7 dias) ===');
  console.table((await c.query(`
    SELECT date_trunc('day', dropped_at)::date AS dia, COUNT(*)::int AS drops
    FROM expedition_blueprint_drops
    WHERE dropped_at >= now() - interval '7 days'
    GROUP BY dia ORDER BY dia DESC
  `)).rows);

  // Drops por hora (ultimas 24h)
  console.log('\n=== DROPS POR HORA (ultimas 24h) ===');
  console.table((await c.query(`
    SELECT date_trunc('hour', dropped_at) AS hora, COUNT(*)::int AS drops
    FROM expedition_blueprint_drops
    WHERE dropped_at >= now() - interval '24 hours'
    GROUP BY hora ORDER BY hora DESC
  `)).rows);

  // Top usuarios
  console.log('\n=== TOP 10 USUARIOS CON MAS PLANOS RECIBIDOS (historico) ===');
  console.table((await c.query(`
    SELECT p.username, COUNT(*)::int AS planos
    FROM expedition_blueprint_drops d
    LEFT JOIN profiles p ON p.id = d.user_id
    GROUP BY p.username ORDER BY planos DESC LIMIT 10
  `)).rows);

  // Ultimos 20 drops
  console.log('\n=== ULTIMOS 20 DROPS ===');
  console.table((await c.query(`
    SELECT
      to_char(d.dropped_at, 'YYYY-MM-DD HH24:MI:SS') AS fecha,
      p.username,
      bp.code,
      d.roll_value::numeric(10,8) AS roll,
      d.chance_used::numeric(10,8) AS chance
    FROM expedition_blueprint_drops d
    JOIN ship_blueprints bp ON bp.id=d.blueprint_id
    LEFT JOIN profiles p ON p.id=d.user_id
    ORDER BY d.dropped_at DESC LIMIT 20
  `)).rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
