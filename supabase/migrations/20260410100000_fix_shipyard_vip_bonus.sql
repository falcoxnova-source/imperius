/*
  # Fix VIP -10% Shipyard Build Time Bonus
  
  The original migration 20260401_vip_time_bonuses.sql tried to patch
  secure_add_to_shipyard_queue using replace() with an anchor text that had
  indentation (6 spaces + 4 spaces + 2 spaces), but the live function body
  has NO leading spaces. The replace() was a no-op — the VIP bonus was
  never injected.
  
  This migration re-patches with the correct anchor text (no indentation).
  Idempotent: if the bonus is already present, it's a no-op.
  
  NOTE: Uses E'' escape strings with explicit \n to avoid CRLF/LF mismatch
  when the .sql file is saved with Windows line endings.
*/

DO $$
DECLARE
  v_src text;
  v_anchor text;
  v_replacement text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_add_to_shipyard_queue'
    AND pronamespace = 'public'::regnamespace;

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_add_to_shipyard_queue not found, skipping';
    RETURN;
  END IF;

  -- Check idempotency: skip if already patched
  IF v_src LIKE '%VIP Plus: -10% shipyard construction time%' THEN
    RAISE NOTICE 'secure_add_to_shipyard_queue already has VIP bonus, skipping';
    RETURN;
  END IF;

  -- Use E'' escape strings with explicit \n to be CRLF-safe.
  -- prosrc always stores LF (\n) regardless of client line endings.
  v_anchor := E'/ v_game_speed\n));\nEND IF;';
  v_replacement := E'/ v_game_speed\n));\nEND IF;\n\n-- VIP Plus: -10% shipyard construction time\nIF is_user_plus(auth.uid()) THEN\n  v_build_time_per_unit := GREATEST(1, FLOOR(v_build_time_per_unit * 0.90));\nEND IF;';

  v_src := replace(v_src, v_anchor, v_replacement);

  -- Verify the patch was applied (replace returns unchanged string if not found)
  IF v_src NOT LIKE '%VIP Plus: -10% shipyard construction time%' THEN
    RAISE EXCEPTION 'Patch anchor text not found in secure_add_to_shipyard_queue. Manual inspection required.';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_add_to_shipyard_queue(p_planet_id uuid, p_item_type text, p_type_id integer, p_quantity integer) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = ''public'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_shipyard_vip_bonus: successfully added -10%% shipyard time to secure_add_to_shipyard_queue';
END $$;
