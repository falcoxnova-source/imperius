-- Ships can only be sold on the market by users with active VIP Plus.
-- Resources and dark_matter remain sellable by everyone.
-- Applied via safe string-replace over pg_get_functiondef so the rest of
-- create_market_listing is preserved exactly.
DO $patch$
DECLARE
  v_src text;
  v_new text;
  v_anchor text := $a$  IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de listado invalido');
  END IF;$a$;
  v_inject text := $a$  IF p_listing_type NOT IN ('resource', 'ship', 'dark_matter') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo de listado invalido');
  END IF;

  -- Only VIP Plus users can sell ships
  IF p_listing_type = 'ship' AND NOT is_user_plus(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo los usuarios con VIP activo pueden vender naves en el mercado. Sin VIP puedes vender recursos con normalidad.', 'requires_vip', true);
  END IF;$a$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_market_listing';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'create_market_listing not found';
  END IF;

  IF position('requires_vip' IN v_src) > 0 THEN
    RAISE NOTICE 'VIP ship-sale check already present, skipping';
    RETURN;
  END IF;

  IF position(v_anchor IN v_src) = 0 THEN
    RAISE EXCEPTION 'Anchor not found in create_market_listing; aborting';
  END IF;

  v_new := replace(v_src, v_anchor, v_inject);
  EXECUTE v_new;
  RAISE NOTICE 'create_market_listing patched: ships require VIP';
END;
$patch$;
