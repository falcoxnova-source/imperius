/*
  # Fix Battle Report Newlines

  BUG: `process_fleet_arrival` uses E-strings with `\\n` which produces
       literal backslash+n (2 visible chars) instead of real newlines (chr(10)).
       The message body stored in `messages` has literal `\n` text
       instead of actual line breaks.

       The frontend regex expects real newlines to parse the
       `--- Unidades Atacante ---` and `--- Unidades Defensor ---`
       sections, so it fails and shows "Sin datos".

  FIX: Replace `\\n` (3 chars in prosrc: \, \, n) with `\n` (2 chars: \, n)
       so that E-strings produce real newlines at runtime.

  SCOPE: Only affects message text formatting.
         No logic, schema, combat, or function signature changes.
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

  -- In prosrc the E-strings contain \\n (3 chars: \, \, n)
  -- which at runtime produces literal \n (wrong).
  -- Replace with \n (2 chars: \, n) so E-strings produce real newlines.
  v_src := replace(v_src, E'\\\\n', E'\\n');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_battle_reports: E-string newlines corrected in battle messages';
END $$;
