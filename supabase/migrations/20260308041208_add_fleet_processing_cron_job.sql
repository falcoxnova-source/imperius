/*
  # Add automatic fleet processing cron job

  1. Changes
    - Add a cron job that runs every minute to process pending fleet arrivals
    - This ensures fleets are processed even when players are offline
    - Previously fleets only got processed on player reconnect, causing them to get stuck

  2. Important Notes
    - Uses existing `process_all_pending_fleets` function
    - Processes up to 100 outbound + 100 returning fleets per minute
*/

SELECT cron.schedule(
  'process-pending-fleets',
  '* * * * *',
  $$SELECT process_all_pending_fleets()$$
);
