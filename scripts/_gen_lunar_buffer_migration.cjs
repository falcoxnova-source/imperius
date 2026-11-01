// Genera la migración: cambia la fórmula 1 + (...level... * 3) → 2 + (...level... * 3)
// en las 6 funciones afectadas y recalcula fields_max de todas las lunas existentes.
const pg = require('pg');
const fs = require('fs');
const path = require('path');

const FUNCS = [
  'admin_process_stuck_building_queues',
  'bot_process_queues',
  'enforce_lunar_base_fields_max',
  'global_process_all_expired_queues',
  'optimized_global_queue_processor',
  'process_all_user_building_queues',
];

const c = new pg.Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  ssl: { rejectUnauthorized: false },
});

// Reemplaza 1 + (X * 3) por 2 + (X * 3) cuando X menciona "level".
// Conserva mayúsculas/minúsculas y espacios. Soporta envueltos en paréntesis.
function patchFormula(src) {
  let count = 0;
  // Caso 1: "1 + (xxx * 3)" donde xxx contiene 'level'
  let out = src.replace(
    /\b1(\s*\+\s*)\(([^()]*level[^()]*)\*(\s*)3\)/gi,
    (_m, p1, inner, sp) => { count++; return `2${p1}(${inner}*${sp}3)`; }
  );
  // Caso 2: "1 + xxx_level * 3" sin paréntesis
  out = out.replace(
    /\b1(\s*\+\s*)([a-zA-Z_][a-zA-Z0-9_.]*level[a-zA-Z0-9_.]*\s*\*\s*3)\b/gi,
    (_m, p1, expr) => { count++; return `2${p1}${expr}`; }
  );
  // Caso 3: "1 + COALESCE(...level..., N) * 3" (llamada a función con paréntesis internos)
  out = out.replace(
    /\b1(\s*\+\s*)(COALESCE\s*\([^)]*level[^)]*\)\s*\*\s*3)\b/gi,
    (_m, p1, expr) => { count++; return `2${p1}${expr}`; }
  );
  return { out, count };
}

(async () => {
  await c.connect();

  const parts = [];
  parts.push(`-- =====================================================================
-- FIX: Aumentar fields_max de las lunas en +1 (buffer de campo libre).
--
-- Fórmula anterior: fields_max = 1 + (lunar_base_level * 3)
-- Fórmula nueva:    fields_max = 2 + (lunar_base_level * 3)
--
-- Motivo: dejar siempre 1 campo libre tras construir la Base Lunar para
-- que el jugador pueda iniciar la siguiente mejora sin quedarse atascado.
--
-- Lunas afectadas: TODAS. Recálculo masivo con GREATEST(fields_used, ...)
-- para no romper a quienes ya están sobreocupados (Lucifer, etc.).
--
-- Funciones recreadas con la fórmula nueva:
${FUNCS.map(f => `--   - ${f}`).join('\n')}
-- =====================================================================
`);

  let totalReplacements = 0;
  for (const fname of FUNCS) {
    const r = await c.query(
      `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prokind='f' and p.proname=$1
       limit 1`,
      [fname]
    );
    if (!r.rows[0]) {
      console.warn('  ! NOT FOUND:', fname);
      continue;
    }
    const { out, count } = patchFormula(r.rows[0].def);
    if (count === 0) {
      console.warn(`  ! ${fname}: no matches (skipping)`);
      continue;
    }
    console.log(`  ✓ ${fname}: ${count} reemplazo(s)`);
    totalReplacements += count;
    parts.push(`\n-- ---------- ${fname} (${count} reemplazo${count>1?'s':''}) ----------\n${out};\n`);
  }

  parts.push(`
-- ---------- Recalcular fields_max de TODAS las lunas existentes ----------
-- Usa GREATEST(fields_used, 2 + level*3) para no reducir bajo lo ya construido.
WITH moon_lb AS (
  SELECT p.id AS planet_id,
         p.fields_used,
         p.fields_max AS old_max,
         COALESCE(pb.level, 0) AS lb_level,
         GREATEST(p.fields_used, 2 + COALESCE(pb.level, 0) * 3) AS new_max
  FROM planets p
  LEFT JOIN planet_buildings pb
    ON pb.planet_id = p.id AND pb.building_type_id = 15
  WHERE p.planet_type = 'moon'
)
UPDATE planets p
SET fields_max = m.new_max
FROM moon_lb m
WHERE p.id = m.planet_id
  AND p.fields_max <> m.new_max;
`);

  parts.push(`
-- ---------- Verificación post-fix ----------
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_bad
  FROM planets p
  LEFT JOIN planet_buildings pb
    ON pb.planet_id = p.id AND pb.building_type_id = 15
  WHERE p.planet_type = 'moon'
    AND p.fields_max < 2 + COALESCE(pb.level, 0) * 3
    AND p.fields_max < p.fields_used;
  IF v_bad > 0 THEN
    RAISE WARNING 'Quedan % lunas con fields_max menor al esperado', v_bad;
  ELSE
    RAISE NOTICE 'OK: todas las lunas cumplen la nueva fórmula (o el sobre-uso lo justifica).';
  END IF;
END$$;
`);

  const outFile = path.join(
    __dirname, '..', 'supabase', 'migrations',
    '20260502120000_lunar_base_fields_buffer_plus_one.sql'
  );
  fs.writeFileSync(outFile, parts.join(''));
  console.log('\nMigration written to:', outFile);
  console.log('Total reemplazos:', totalReplacements);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
