/*
  # Fix battle report: wrong jsonb keys in process_fleet_arrival

  1. Bug fixes
    - `combat_result->>'winner'` changed to `combat_result->>'result'` (correct key from simulate_xnova_combat)
    - `'attacker'` changed to `'attacker_won'`, `'defender'` changed to `'defender_won'` (correct values)
    - `combat_result->>'attacker_report'` replaced with `format_unit_report()` call (key doesn't exist in combat result)
    - `combat_result->>'defender_report'` replaced with `format_unit_report()` call (key doesn't exist in combat result)
    - `UPPER(COALESCE(combat_result->>'winner', 'draw'))` replaced with proper CASE expression

  2. Root cause
    - Migration 20260303183252 rewrote process_fleet_arrival using incorrect jsonb keys
    - simulate_xnova_combat returns 'result' key (not 'winner') with values 'attacker_won'/'defender_won'/'draw'
    - simulate_xnova_combat returns 'initial_attacker'/'attacker_remaining' arrays (not 'attacker_report' text)
    - process_acs_fleet_arrival already uses the correct keys and format_unit_report - this fix aligns process_fleet_arrival

  3. Impact
    - Fixes combat result evaluation (attacker wins, defender wins, draws now processed correctly)
    - Fixes battle report messages to show unit details instead of empty sections
*/

DO $$
DECLARE
  v_src text;
  v_new_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'process_fleet_arrival'
  AND pronargs = 1;

  v_new_src := v_src;

  -- Fix 1: Replace winner key comparisons with result key and correct values
  v_new_src := replace(v_new_src, 
    E'combat_result->>\'winner\') = \'attacker\'', 
    E'combat_result->>\'result\') = \'attacker_won\'');
  v_new_src := replace(v_new_src, 
    E'combat_result->>\'winner\') = \'defender\'', 
    E'combat_result->>\'result\') = \'defender_won\'');

  -- Fix 2: Replace attacker_report with format_unit_report call
  v_new_src := replace(v_new_src,
    E'COALESCE(combat_result->>\'attacker_report\', \'\')',
    E'format_unit_report(combat_result->\'initial_attacker\', combat_result->\'attacker_remaining\', \'attacker\')');

  -- Fix 3: Replace defender_report with format_unit_report call
  v_new_src := replace(v_new_src,
    E'COALESCE(combat_result->>\'defender_report\', \'\')',
    E'format_unit_report(combat_result->\'initial_defender\', combat_result->\'defender_remaining\', \'defender\')');

  -- Fix 4: Replace UPPER(COALESCE(combat_result->>'winner', 'draw')) with proper CASE
  v_new_src := replace(v_new_src,
    E'UPPER(COALESCE(combat_result->>\'winner\', \'draw\'))',
    E'CASE (combat_result->>\'result\') WHEN \'attacker_won\' THEN \'VICTORIA ATACANTE\' WHEN \'defender_won\' THEN \'VICTORIA DEFENSOR\' ELSE \'EMPATE\' END');

  -- Now recreate the function with fixed source
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION process_fleet_arrival(p_fleet_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$%s$fn$',
    v_new_src
  );
END $$;
