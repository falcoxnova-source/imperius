/*
  # Limit max active market listings per player

  BUG: Players can spam the market with many identical small offers 
  (e.g. 30x "10 satellites") to flood the listings page.

  FIX: Add a check at the beginning of create_market_listing that 
  counts active listings per player. Max 15 active listings at a time.
  
  This uses a DO block with pg_proc text replacement to surgically 
  insert ONLY the limit check without rewriting the entire function.
*/

DO $$
DECLARE
  v_func_body text;
  v_search text;
  v_replace text;
BEGIN
  -- Get current function body
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'create_market_listing';

  IF v_func_body IS NULL THEN
    RAISE EXCEPTION 'create_market_listing function not found';
  END IF;

  -- Insert the limit check right after the Telegram group membership check
  -- We search for the quantity validation (which comes after Telegram checks)
  -- and prepend our new check before it
  v_search := 'IF p_quantity <= 0 THEN';
  
  v_replace := '-- Limit max active listings per player (anti-spam)
IF (SELECT COUNT(*) FROM market_listings WHERE seller_id = v_user_id AND status = ''active'') >= 15 THEN
RETURN jsonb_build_object(''success'', false, ''error'', ''Maximo 15 ofertas activas permitidas. Cancela o espera que se vendan algunas.'');
END IF;

IF p_quantity <= 0 THEN';

  IF v_func_body NOT LIKE '%Maximo 15 ofertas activas%' THEN
    v_func_body := replace(v_func_body, v_search, v_replace);

    EXECUTE format(
      'CREATE OR REPLACE FUNCTION create_market_listing(p_listing_type text, p_item_code text, p_quantity bigint, p_price_per_unit numeric, p_planet_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
      v_func_body
    );

    RAISE NOTICE 'market_listing_limit: Added max 15 active listings check';
  ELSE
    RAISE NOTICE 'market_listing_limit: Check already exists, skipping';
  END IF;
END $$;
