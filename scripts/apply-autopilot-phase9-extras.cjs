const fs = require('fs');
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
  const sql = fs.readFileSync('supabase/migrations/20260417190000_autopilot_phase9_extras.sql', 'utf8');
  await client.query(sql);
  console.log('✅ Migración Fase 9 (extras) aplicada');

  // Actualizar cursor de bot_ai_tick para respetar expiración
  const fn = await client.query(`
    SELECT p.prosrc, pg_get_function_result(p.oid) AS result, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'bot_ai_tick' AND n.nspname = 'public' LIMIT 1
  `);
  let src = fn.rows[0].prosrc;
  const returnType = fn.rows[0].result;
  const argsSig = fn.rows[0].args;

  const oldCursor = "WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND (autopilot_vip_boost = true OR last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))";
  const newCursor = "WHERE (is_bot = true OR (autopilot_active = true AND has_autopilot_access(id) AND ((autopilot_vip_boost = true AND (autopilot_vip_boost_expires_at IS NULL OR autopilot_vip_boost_expires_at > NOW())) OR last_manual_action IS NULL OR last_manual_action < NOW() - INTERVAL '5 minutes')))";

  if (!src.includes(oldCursor)) {
    throw new Error('No se encontró el cursor de VIP boost para actualizar');
  }
  src = src.replace(oldCursor, newCursor);

  await client.query(`CREATE OR REPLACE FUNCTION public.bot_ai_tick(${argsSig}) RETURNS ${returnType} LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$${src}$func$`);
  console.log('✅ bot_ai_tick actualizado con expiración VIP');

  // Cron opcional: auto-limpiar VIP boost vencido (no imprescindible porque el cursor ya lo filtra,
  // pero deja el estado consistente para la UI)
  await client.query(`
    UPDATE public.profiles
    SET autopilot_vip_boost = false, autopilot_vip_boost_expires_at = NULL
    WHERE autopilot_vip_boost = true
      AND autopilot_vip_boost_expires_at IS NOT NULL
      AND autopilot_vip_boost_expires_at <= NOW();
  `);

  const check = await client.query(`
    SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='autopilot_vip_boost_expires_at') AS has_expires,
      EXISTS(SELECT 1 FROM pg_proc WHERE proname='get_autopilot_stats') AS has_stats_rpc,
      EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='autopilot_events') AS has_realtime
  `);
  console.log('🔎', check.rows[0]);
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
