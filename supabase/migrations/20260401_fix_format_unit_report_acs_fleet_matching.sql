-- ============================================================
-- Fix: format_unit_report incorrect display for ACS battles
--
-- BUG: When multiple ACS fleets have the same ship type,
-- format_unit_report looks up remaining by 'code' with LIMIT 1,
-- always returning the FIRST fleet's remaining quantity.
-- This shows phantom losses or phantom survivals in reports.
--
-- Example: TON-618 has 1 Death Star (survived), Neymar has 3 (survived)
--   Report shows Neymar's Death Stars as "1/3 -2 lost" because
--   it found TON-618's remaining=1 first.
--
-- FIX: Use array index matching (initial and remaining arrays
-- have the same structure/order from simulate_xnova_combat)
-- instead of code-based lookup with LIMIT 1.
--
-- Also handles the defender side correctly for defenses.
-- ============================================================

CREATE OR REPLACE FUNCTION format_unit_report(
  p_initial_units jsonb,
  p_remaining_units jsonb,
  p_side text
)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_report text := '';
  v_unit_data jsonb;
  v_initial_qty integer;
  v_remaining_qty integer;
  v_unit_name text;
  v_unit_code text;
  v_unit_fleet_id text;
  v_idx integer := 0;
BEGIN
  IF p_initial_units IS NULL OR jsonb_array_length(p_initial_units) = 0 THEN
    RETURN '  Ninguna';
  END IF;

  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_initial_units)
  LOOP
    v_unit_name := v_unit_data->>'name';
    v_unit_code := v_unit_data->>'code';
    v_unit_fleet_id := v_unit_data->>'fleet_id';
    v_initial_qty := COALESCE((v_unit_data->>'initial_quantity')::integer, (v_unit_data->>'quantity')::integer, 0);

    IF v_initial_qty <= 0 THEN
      v_idx := v_idx + 1;
      CONTINUE;
    END IF;

    v_remaining_qty := 0;

    IF p_remaining_units IS NOT NULL THEN
      -- Method 1: Try index-based matching first (most reliable for ACS)
      -- Both initial and remaining arrays maintain the same order from combat simulation
      IF v_idx < jsonb_array_length(p_remaining_units) THEN
        DECLARE
          v_remaining_at_idx jsonb;
          v_remaining_code text;
        BEGIN
          v_remaining_at_idx := p_remaining_units->v_idx;
          v_remaining_code := v_remaining_at_idx->>'code';
          
          -- Verify the code matches at this index (sanity check)
          IF v_remaining_code = v_unit_code THEN
            v_remaining_qty := COALESCE((v_remaining_at_idx->>'quantity')::integer, 0);
          ELSE
            -- Fallback: code+fleet_id matching for ACS, then code-only
            IF v_unit_fleet_id IS NOT NULL THEN
              SELECT (r_unit->>'quantity')::integer INTO v_remaining_qty
              FROM jsonb_array_elements(p_remaining_units) AS r_unit
              WHERE r_unit->>'code' = v_unit_code
                AND r_unit->>'fleet_id' = v_unit_fleet_id
              LIMIT 1;
            END IF;
            
            IF v_remaining_qty IS NULL OR v_remaining_qty = 0 THEN
              SELECT (r_unit->>'quantity')::integer INTO v_remaining_qty
              FROM jsonb_array_elements(p_remaining_units) AS r_unit
              WHERE r_unit->>'code' = v_unit_code
              LIMIT 1;
            END IF;
          END IF;
        END;
      ELSE
        -- Array sizes differ, use fleet_id+code or code-only fallback
        IF v_unit_fleet_id IS NOT NULL THEN
          SELECT (r_unit->>'quantity')::integer INTO v_remaining_qty
          FROM jsonb_array_elements(p_remaining_units) AS r_unit
          WHERE r_unit->>'code' = v_unit_code
            AND r_unit->>'fleet_id' = v_unit_fleet_id
          LIMIT 1;
        END IF;
        
        IF v_remaining_qty IS NULL THEN
          SELECT (r_unit->>'quantity')::integer INTO v_remaining_qty
          FROM jsonb_array_elements(p_remaining_units) AS r_unit
          WHERE r_unit->>'code' = v_unit_code
          LIMIT 1;
        END IF;
      END IF;
    END IF;

    v_remaining_qty := COALESCE(v_remaining_qty, 0);

    IF v_report != '' THEN
      v_report := v_report || E'\n';
    END IF;

    IF v_remaining_qty = 0 THEN
      v_report := v_report || format('  %s: %s -> 0 (-%s destruidas)',
        v_unit_name, v_initial_qty, v_initial_qty);
    ELSIF v_remaining_qty < v_initial_qty THEN
      v_report := v_report || format('  %s: %s -> %s (-%s)',
        v_unit_name, v_initial_qty, v_remaining_qty, v_initial_qty - v_remaining_qty);
    ELSE
      v_report := v_report || format('  %s: %s (sin perdidas)',
        v_unit_name, v_initial_qty);
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  IF v_report = '' THEN
    v_report := '  Ninguna';
  END IF;

  RETURN v_report;
END;
$$;

GRANT EXECUTE ON FUNCTION format_unit_report(jsonb, jsonb, text) TO authenticated;
