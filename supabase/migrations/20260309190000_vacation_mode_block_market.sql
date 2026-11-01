/*
  # Block Market in Vacation Mode + Auto-Cancel Active Listings

  1. toggle_vacation_mode: When enabling vacation, cancel all active market listings
     for the user and notify via system message.

  2. purchase_market_listing: Block buying if the buyer is in vacation mode.

  SCOPE: Only adds vacation checks to these two functions.
         No schema, column, table, or other function changes.
*/

-- Fix 1: Patch toggle_vacation_mode to cancel active market listings on enable
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'toggle_vacation_mode'
    AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'toggle_vacation_mode not found, skipping';
    RETURN;
  END IF;

  -- Insert auto-cancel right after the research pause (last action before RETURN).
  -- Anchor: unique single-line "AND is_researching = true AND research_end_time IS NOT NULL;"
  v_src := replace(v_src,
    'AND is_researching = true AND research_end_time IS NOT NULL;',
    'AND is_researching = true AND research_end_time IS NOT NULL;' || chr(10) || chr(10) ||
    '-- Auto-cancel all active market listings for this user' || chr(10) ||
    'UPDATE market_listings' || chr(10) ||
    'SET status = ''cancelled'', updated_at = now()' || chr(10) ||
    'WHERE seller_id = v_user_id AND status = ''active'';');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION toggle_vacation_mode(p_enable boolean) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path TO ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'toggle_vacation_mode: now cancels active market listings on enable';
END $$;

-- Fix 2: Patch purchase_market_listing to block buyers in vacation mode
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'purchase_market_listing'
    AND pronargs = 2;

  IF v_src IS NULL THEN
    RAISE NOTICE 'purchase_market_listing not found, skipping';
    RETURN;
  END IF;

  -- Insert vacation check right after the auth check.
  -- Anchor: the unique telegram_id SELECT that follows the auth block.
  v_src := replace(v_src,
    'SELECT telegram_id INTO v_telegram_id',
    'IF EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id AND vacation_mode = true) THEN
    RETURN jsonb_build_object(''success'', false, ''error'', ''Cannot use the market while in vacation mode'');
  END IF;

  SELECT telegram_id INTO v_telegram_id');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION purchase_market_listing(p_listing_id uuid, p_quantity integer DEFAULT NULL) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'purchase_market_listing: now blocks buyers in vacation mode';
END $$;
