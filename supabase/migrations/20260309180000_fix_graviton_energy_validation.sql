/*
  # Fix Graviton Energy Validation (Backend + Replace Broken Migration 309)

  ## Problem
  Migration 356 rewrote `secure_start_research` completely, removing the energy
  validation that was added in migration 148. Migration 20260309140000 tried to
  patch it via text replace, but the old text no longer existed → no-op.

  Result: Graviton (and any tech with energy_required > 0) can be researched
  at ANY level without any energy check on the server side.

  ## OGame Reference (https://ogame.fandom.com/wiki/Graviton_Technology)
  - Level 1 costs  300,000 energy  (300000 × 3^0)
  - Level 2 costs  900,000 energy  (300000 × 3^1)
  - Level 3 costs 2,700,000 energy (300000 × 3^2)
  - Formula: energy_required × cost_factor ^ current_level

  ## Fix
  Inject the energy validation block into `secure_start_research` via replace()
  on prosrc, right after the max_level check and before the cost calculation.

  SCOPE: Only adds energy validation to secure_start_research.
         No schema, column, or other function changes.
*/

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc
  WHERE proname = 'secure_start_research'
    AND proargtypes::text LIKE '%uuid%int%';

  IF v_src IS NULL THEN
    RAISE NOTICE 'secure_start_research not found, skipping';
    RETURN;
  END IF;

  -- Inject energy validation right before the cost calculation line.
  -- Anchor: "v_cost_metal := FLOOR" is unique and exists in the current body.
  v_src := replace(v_src,
    'v_cost_metal := FLOOR',
    '-- Energy requirement check (Graviton etc.)
  IF COALESCE(v_tech_type.energy_required, 0) > 0 THEN
    DECLARE
      v_scaled_energy bigint;
      v_available_energy integer;
    BEGIN
      v_scaled_energy := CEIL(v_tech_type.energy_required * POWER(v_tech_type.cost_factor, v_current_level));
      SELECT COALESCE((calculate_planet_resources(p_planet_id)->>''energy_max'')::integer, 0)
        INTO v_available_energy;
      IF v_available_energy < v_scaled_energy THEN
        RETURN jsonb_build_object(
          ''success'', false,
          ''error'', ''Insufficient energy production. Required: '' || v_scaled_energy || '', Available: '' || v_available_energy
        );
      END IF;
    END;
  END IF;

  v_cost_metal := FLOOR');

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION secure_start_research(p_planet_id uuid, p_tech_type_id integer) '
    'RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER '
    'SET search_path = public SET statement_timeout = ''60s'' SET lock_timeout = ''30s'' '
    'AS $fn$ %s $fn$',
    v_src
  );

  RAISE NOTICE 'fix_graviton_energy: added scaled energy validation to secure_start_research';
END $$;
