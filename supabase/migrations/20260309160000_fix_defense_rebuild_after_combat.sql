/*
  # Fix Defense Rebuild After Combat

  BUG: In `process_fleet_arrival`, the `defender_won` and `draw` branches
       use `quantity = quantity + v_rebuilt_qty` when processing destroyed
       defenses. This ADDS rebuilt units without subtracting the destroyed
       ones first, causing defenses to INCREASE after combat.

       Example: 1000 launchers, 200 destroyed, ~140 rebuilt (70%)
       Wrong:   1000 + 140 = 1140  (or more with duplicate entries)
       Correct: 1000 - 200 + 140 = 940

       The `attacker_won` branch already has the correct formula:
       `quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty)`

  FIX: Replace `quantity = quantity + v_rebuilt_qty` with
       `quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty)`
       in both the defender_won and draw branches.

  SCOPE: Only affects defense quantity update after combat.
         No schema, column, function signature, or combat logic changes.
*/

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
  AND pronargs = 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'process_fleet_arrival not found, skipping';
    RETURN;
  END IF;

  -- The wrong formula appears in defender_won and draw branches.
  -- The attacker_won branch already uses the correct formula, so
  -- this replace only affects the two broken branches.
  v_src := replace(v_src,
    'quantity = quantity + v_rebuilt_qty',
    'quantity = GREATEST(0, quantity - v_destroyed_qty + v_rebuilt_qty)');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_defense_rebuild: defender_won and draw branches now subtract destroyed before adding rebuilt';
END $$;
