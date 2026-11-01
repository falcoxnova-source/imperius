-- ============================================================================
-- CPU OPTIMIZATION PHASE 2: Messages performance + cleanup jobs
-- ============================================================================
-- NOTE: RLS policy split (OR → 2 separate policies) must be run from
-- Supabase Dashboard SQL Editor due to Realtime replication slot lock.
-- See bottom of file for the SQL to run manually in Dashboard.
-- ============================================================================

-- 1. Add optimized indexes for messages
-- ============================================================================
-- For Header query: SELECT ... WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 5
CREATE INDEX IF NOT EXISTS idx_messages_recipient_created 
  ON messages(recipient_id, created_at DESC);

-- For sent messages query: SELECT ... WHERE sender_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_messages_sender_created 
  ON messages(sender_id, created_at DESC);

-- For message_type filtered queries (inbox filter, broadcast detection)
CREATE INDEX IF NOT EXISTS idx_messages_recipient_type 
  ON messages(recipient_id, message_type, created_at DESC);

-- Note: idx_messages_recipient (recipient_id, is_read) already exists for unread count

-- 3. Schedule auto-cleanup of old messages (keep table lean)
-- ============================================================================
-- expedition/espionage reports > 14 days (tactical info loses value quickly)
-- system messages > 30 days (notifications, no long-term value)
-- broadcast messages already cleaned by existing 'cleanup_old_broadcast_messages' job
-- player-to-player messages: NEVER deleted (user content)
-- combat reports: kept 30 days
SELECT cron.schedule(
  'cleanup-old-game-messages',
  '30 3 * * *',
  $$DELETE FROM public.messages 
    WHERE (
      (message_type IN ('expedition', 'espionage') AND created_at < now() - interval '14 days')
      OR (message_type = 'system' AND created_at < now() - interval '30 days')
      OR (message_type = 'combat' AND created_at < now() - interval '30 days')
    )$$
);

-- 4. Schedule cleanup of cron.job_run_details (180K rows, 35MB, growing)
-- ============================================================================
SELECT cron.schedule(
  'cleanup-cron-run-details',
  '30 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);

-- 5. Immediate cleanup of old messages (reduce 374K → ~150K)
-- ============================================================================
DELETE FROM messages 
WHERE message_type IN ('expedition', 'espionage') 
  AND created_at < now() - interval '14 days';

DELETE FROM messages 
WHERE message_type = 'system' 
  AND created_at < now() - interval '30 days';

DELETE FROM messages 
WHERE message_type = 'combat' 
  AND created_at < now() - interval '30 days';

-- 6. Immediate cleanup of cron.job_run_details
-- ============================================================================
DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';

-- ============================================================================
-- MANUAL STEP: Run this SQL from Supabase Dashboard → SQL Editor
-- (Cannot run via pooler due to Realtime replication slot lock)
-- ============================================================================
-- DROP POLICY IF EXISTS "Users can view own messages" ON messages;
-- CREATE POLICY "Users can view received messages" ON messages
--   FOR SELECT TO authenticated
--   USING (recipient_id = auth.uid());
-- CREATE POLICY "Users can view sent messages" ON messages
--   FOR SELECT TO authenticated
--   USING (sender_id = auth.uid());
