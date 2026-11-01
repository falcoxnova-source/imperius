/*
  # Fix Graviton Energy Check

  BUG: `secure_start_research` reads `energy_production` / `energy_consumption`
       from the `planets` table, but those columns DO NOT EXIST.
       Energy is calculated dynamically by `calculate_planet_resources()`.
       Result: energy always reads as 0, so Graviton can NEVER be researched.

  FIX: Replace the broken query with a call to `calculate_planet_resources()`
       and read `energy_max` from its result.
*/

DO $$
DECLARE
  v_func_body text;
BEGIN
  SELECT prosrc INTO v_func_body
  FROM pg_proc
  WHERE proname = 'secure_start_research';

  IF v_func_body IS NULL THEN
    RAISE NOTICE 'secure_start_research not found, skipping';
    RETURN;
  END IF;

  -- Replace the broken energy query that reads non-existent columns
  v_func_body := replace(
    v_func_body,
    'SELECT COALESCE(energy_production, 0) - COALESCE(energy_consumption, 0)
INTO v_total_energy
FROM planets
WHERE id = p_planet_id',
    'SELECT COALESCE((calculate_planet_resources(p_planet_id)->>''energy_max'')::integer, 0)
INTO v_total_energy'
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_start_research(p_planet_id uuid, p_tech_type_id integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = ''60s'' SET lock_timeout = ''30s'' AS $fn$ %s $fn$',
    v_func_body
  );

  RAISE NOTICE 'fix_graviton: patched secure_start_research to use calculate_planet_resources for energy check';
END $$;
