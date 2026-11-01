const { Client } = require('pg');

const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_result(p.oid) AS result, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public' LIMIT 1
  `);
  let src = fn.rows[0].prosrc;
  const returnType = fn.rows[0].result;
  const argsSig = fn.rows[0].args;

  if (src.includes('-- Autopilot cleanup (VIP boost + lost access)')) {
    console.log('ℹ️  Cleanup ya estaba inyectado, regenerando idempotente...');
  }

  // Localizar el DECLARE principal y añadir un bloque de limpieza tras el BEGIN raíz.
  // Buscamos el primer BEGIN después del DECLARE principal.
  const anchor = '-- Bot cursor profiles';
  const anchor2 = 'FOR v_bot IN';
  let insertBefore = src.indexOf(anchor);
  if (insertBefore === -1) {
    insertBefore = src.indexOf(anchor2);
  }
  if (insertBefore === -1) {
    // Fallback: insertar tras el primer BEGIN de la función
    const beginIdx = src.indexOf('BEGIN');
    if (beginIdx === -1) throw new Error('No se encontró BEGIN en bot_ai_tick');
    insertBefore = beginIdx + 'BEGIN'.length;
  }

  const cleanup = `
  -- Autopilot cleanup (VIP boost + lost access)
  -- 1) VIP Boost expirado: limpiar flags para que la UI refleje el estado real
  UPDATE public.profiles
  SET autopilot_vip_boost = false,
      autopilot_vip_boost_expires_at = NULL
  WHERE autopilot_vip_boost = true
    AND autopilot_vip_boost_expires_at IS NOT NULL
    AND autopilot_vip_boost_expires_at <= NOW();

  -- 2) Autopiloto activo sin acceso (oficial Androide caducado y no admin-eligible): desactivar
  UPDATE public.profiles p
  SET autopilot_active = false,
      autopilot_vip_boost = false,
      autopilot_vip_boost_expires_at = NULL
  WHERE p.autopilot_active = true
    AND p.is_bot = false
    AND NOT has_autopilot_access(p.id);

`;

  // Si ya existe el comentario, no re-inyectar (evitar acumular bloques)
  if (!src.includes('-- Autopilot cleanup (VIP boost + lost access)')) {
    src = src.slice(0, insertBefore) + cleanup + src.slice(insertBefore);
  }

  await client.query(`CREATE OR REPLACE FUNCTION public.bot_ai_tick(${argsSig}) RETURNS ${returnType} LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$${src}$func$`);
  console.log('✅ bot_ai_tick con limpieza auto-expire inyectada');

  // Aplicar limpieza una vez ahora
  const r1 = await client.query(`UPDATE public.profiles SET autopilot_vip_boost=false, autopilot_vip_boost_expires_at=NULL WHERE autopilot_vip_boost=true AND autopilot_vip_boost_expires_at IS NOT NULL AND autopilot_vip_boost_expires_at<=NOW()`);
  const r2 = await client.query(`UPDATE public.profiles p SET autopilot_active=false, autopilot_vip_boost=false, autopilot_vip_boost_expires_at=NULL WHERE p.autopilot_active=true AND p.is_bot=false AND NOT has_autopilot_access(p.id)`);
  console.log(`🧹 Limpiados ahora: VIP expirados=${r1.rowCount}, autopilotos sin acceso=${r2.rowCount}`);

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
