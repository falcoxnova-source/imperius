/*
  # Automatic Fleet Processing with pg_cron

  ## Summary
  This migration enables pg_cron and creates a scheduled job to automatically
  process all pending fleets every minute. This ensures fleets are never stuck
  even when no users are connected.

  ## Problem Solved
  Previously, fleets only processed when users were connected and the frontend
  called the processing functions. If a user sent a fleet and disconnected,
  it would stay stuck until someone reconnected.

  ## Solution
  - Enable pg_cron extension
  - Create a cron job that runs every minute
  - The job calls `process_all_pending_fleets()` to process all overdue fleets

  ## Business Logic
  - This does NOT change any business logic
  - Uses the same `process_all_pending_fleets()` function already in place
  - Simply automates the calling of this function on a schedule

  ## Security
  - pg_cron runs with database superuser privileges
  - The processing function has SECURITY DEFINER to access all data safely
*/

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role (required for cron jobs)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create the cron job to process fleets every minute
-- This job runs at second 0 of every minute
SELECT cron.schedule(
  'process-pending-fleets',  -- job name
  '* * * * *',               -- every minute
  $$SELECT process_all_pending_fleets()$$
);

-- Also create a job to process building queues every minute
-- This ensures buildings complete even when users are offline
SELECT cron.schedule(
  'process-building-queues',
  '* * * * *',
  $$SELECT process_all_user_building_queues()$$
);

-- And shipyard queues
SELECT cron.schedule(
  'process-shipyard-queues', 
  '* * * * *',
  $$SELECT process_all_user_shipyard_queues()$$
);

-- Create a function to check and process research completion for all users
CREATE OR REPLACE FUNCTION process_all_research_completion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_processed_count integer := 0;
BEGIN
  FOR v_user IN 
    SELECT DISTINCT ut.user_id
    FROM user_technologies ut
    WHERE ut.is_researching = true
    AND ut.research_end_time <= NOW()
  LOOP
    BEGIN
      PERFORM complete_research(v_user.user_id);
      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error completing research for user %: %', v_user.user_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed_count', v_processed_count
  );
END;
$$;

-- Schedule research processing every minute
SELECT cron.schedule(
  'process-research-completion',
  '* * * * *',
  $$SELECT process_all_research_completion()$$
);
