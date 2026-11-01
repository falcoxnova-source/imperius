-- =============================================================================
-- Auto-limpieza: Eliminar mensajes broadcast con más de 7 días
-- =============================================================================
-- Los comunicados del admin (message_type = 'broadcast') se acumulan en la
-- tabla messages. Este cron job los elimina automáticamente tras 7 días,
-- independientemente de si fueron leídos o no.
--
-- Ejecuta diariamente a las 03:00 UTC (hora de baja actividad).
-- =============================================================================

-- Eliminar job previo si existe (idempotente)
SELECT cron.unschedule('cleanup_old_broadcast_messages')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup_old_broadcast_messages'
);

-- Programar limpieza diaria a las 03:00 UTC
SELECT cron.schedule(
  'cleanup_old_broadcast_messages',
  '0 3 * * *',
  $$DELETE FROM public.messages WHERE message_type = 'broadcast' AND created_at < NOW() - INTERVAL '7 days'$$
);
