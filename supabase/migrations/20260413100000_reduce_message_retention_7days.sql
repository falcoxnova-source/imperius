-- ============================================================
-- Reduce system message retention from 30 days to 7 days
-- Also reduce combat reports from 30 days to 7 days
-- ============================================================

-- Remove old cron job
SELECT cron.unschedule('cleanup-old-game-messages');

-- Re-create with 7-day retention for system and combat
SELECT cron.schedule(
  'cleanup-old-game-messages',
  '30 3 * * *',
  $$DELETE FROM public.messages 
    WHERE (
      (message_type IN ('expedition', 'espionage') AND created_at < now() - interval '7 days')
      OR (message_type = 'system' AND created_at < now() - interval '7 days')
      OR (message_type = 'combat' AND created_at < now() - interval '7 days')
    )$$
);

-- Immediate cleanup with new retention
DELETE FROM messages 
WHERE message_type IN ('expedition', 'espionage', 'system', 'combat') 
  AND created_at < now() - interval '7 days';
