/*
  # Fix Battle Report type_id Collision Between Ships and Defenses

  ## Problem
  The `format_unit_report` function matches initial units to remaining units
  using `type_id`. However, `ship_types` and `defense_types` are separate tables
  with independent auto-increment IDs that overlap (both start at 1).

  This causes the report to show incorrect losses when a defense and a ship
  share the same numeric ID. For example:
    - rocket_launcher (defense id=1) gets confused with small_cargo (ship id=1)
    - light_laser (defense id=2) gets confused with large_cargo (ship id=2)
    - ion_cannon (defense id=5) gets confused with espionage_probe (ship id=5)

  The result is battle reports showing massive phantom defense losses that
  never actually happened.

  ## Solution
  - Change the lookup key from `type_id` to `code`, which is unique across
    all unit types (e.g., 'rocket_launcher', 'small_cargo')
  - No other functions are affected; this is a display-only fix

  ## Important Notes
  - The combat simulation itself was NOT affected (uses `code` for rapid fire)
  - The loss application in `process_fleet_arrival` was NOT affected (uses `is_defense`)
  - Actual game data (planet_defenses, planet_ships) was never corrupted
  - Only the text of battle report messages was showing wrong numbers
*/

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
BEGIN
  IF p_initial_units IS NULL OR jsonb_array_length(p_initial_units) = 0 THEN
    RETURN '  Ninguna';
  END IF;

  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_initial_units)
  LOOP
    v_unit_name := v_unit_data->>'name';
    v_unit_code := v_unit_data->>'code';
    v_initial_qty := COALESCE((v_unit_data->>'initial_quantity')::integer, (v_unit_data->>'quantity')::integer, 0);

    IF v_initial_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_remaining_qty := 0;

    IF p_remaining_units IS NOT NULL THEN
      SELECT (r_unit->>'quantity')::integer INTO v_remaining_qty
      FROM jsonb_array_elements(p_remaining_units) AS r_unit
      WHERE r_unit->>'code' = v_unit_code
      LIMIT 1;
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
  END LOOP;

  IF v_report = '' THEN
    v_report := '  Ninguna';
  END IF;

  RETURN v_report;
END;
$$;

GRANT EXECUTE ON FUNCTION format_unit_report(jsonb, jsonb, text) TO authenticated;