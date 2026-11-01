/*
  # Twitter Auto-Missions & Required Hashtags

  1. Changes to twitter_social_config
    - Add `required_hashtags` - Hashtags users must include in their tweets
    - Add `official_twitter_user_id` - Twitter user ID for API queries
    - Add `last_fetched_tweet_id` - Track last processed tweet for polling

  2. Cron job (pg_cron + pg_net)
    - Every 5 minutes, call the fetch-twitter-missions edge function
    - Automatically creates missions for new tweets from @FalcoX_universe
*/

-- Add new columns to twitter_social_config
ALTER TABLE twitter_social_config 
  ADD COLUMN IF NOT EXISTS required_hashtags text[] NOT NULL DEFAULT ARRAY['#FalcoX', '#Xnova', '#ogames'],
  ADD COLUMN IF NOT EXISTS official_twitter_user_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_fetched_tweet_id text DEFAULT NULL;

-- Update the existing config row with the required hashtags
UPDATE twitter_social_config
SET required_hashtags = ARRAY['#FalcoX', '#Xnova', '#ogames'],
    official_account = 'FalcoX_universe'
WHERE id = (SELECT id FROM twitter_social_config LIMIT 1);

-- ============================================================
-- CRON JOB: Auto-fetch new tweets every 5 minutes
-- Uses pg_cron + pg_net to call the Edge Function
-- ============================================================

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create the cron job to fetch new tweets every 5 minutes
SELECT cron.schedule(
  'fetch-twitter-missions',
  '*/5 * * * *',
  $$
  SELECT extensions.http((
    'POST',
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/fetch-twitter-missions',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{}'
  )::extensions.http_request);
  $$
);
