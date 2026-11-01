/*
  # Fix Market Notification Authentication

  ## Summary
  Updates the market notification function to include the required
  apikey header for Supabase Edge Functions.

  ## Changes
  - Add apikey header to HTTP request from pg_net
*/

-- Store the anon key in the config table for use in HTTP calls
ALTER TABLE market_notification_config 
ADD COLUMN IF NOT EXISTS anon_key text;

-- Update with the anon key
UPDATE market_notification_config 
SET anon_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmdjbnZ5ZG1qcWNldmdtbGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczOTE2MDEsImV4cCI6MjA4Mjk2NzYwMX0.YYoUqIuz9GS-pgkqkSz33W6K7TCYSyayc1yHtUCryUU'
WHERE id = 1;

-- Update function to include apikey header
CREATE OR REPLACE FUNCTION send_market_telegram_notification(
  p_listing_id uuid,
  p_seller_username text,
  p_listing_type text,
  p_item_code text,
  p_quantity bigint,
  p_price_per_unit numeric,
  p_total_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_request_id bigint;
BEGIN
  SELECT edge_function_url, is_enabled, anon_key INTO v_config
  FROM market_notification_config
  WHERE id = 1;
  
  IF v_config IS NULL OR NOT v_config.is_enabled OR v_config.edge_function_url = '' THEN
    RETURN;
  END IF;
  
  SELECT net.http_post(
    url := v_config.edge_function_url,
    body := jsonb_build_object(
      'listing_id', p_listing_id,
      'seller_username', p_seller_username,
      'listing_type', p_listing_type,
      'item_code', p_item_code,
      'quantity', p_quantity,
      'price_per_unit', p_price_per_unit,
      'total_price', p_total_price
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_config.anon_key
    )
  ) INTO v_request_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Market notification error: %', SQLERRM;
END;
$$;
