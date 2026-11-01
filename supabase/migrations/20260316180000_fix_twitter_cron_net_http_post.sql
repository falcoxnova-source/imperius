/*
  # Fix Twitter Missions Cron Job - Use net.http_post (pg_net)

  The previous migration used extensions.http which is incorrect.
  Supabase uses pg_net (net.http_post) for HTTP calls from pg_cron.

  Also stores the project URL and anon key in config for the cron to use.
*/

-- Add column to store the project URL (not sensitive, already public in frontend)
ALTER TABLE twitter_social_config
  ADD COLUMN IF NOT EXISTS supabase_project_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supabase_anon_key text DEFAULT NULL;

-- Drop the old (broken) cron job if it exists
SELECT cron.unschedule('fetch-twitter-missions') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-twitter-missions'
);

-- Create correct cron job using net.http_post
-- NOTE: After applying this migration, update supabase_project_url and supabase_anon_key
-- in the twitter_social_config table with your project values.
-- They will be auto-populated by the Edge Function on first run if SUPABASE_URL env var is set.

-- The cron reads the URL and key from the config table at runtime
SELECT cron.schedule(
  'fetch-twitter-missions',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := c.supabase_project_url || '/functions/v1/fetch-twitter-missions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || c.supabase_anon_key
    ),
    body := '{}'::jsonb
  )
  FROM twitter_social_config c
  WHERE c.supabase_project_url IS NOT NULL
    AND c.supabase_anon_key IS NOT NULL
  LIMIT 1;
  $$
);
