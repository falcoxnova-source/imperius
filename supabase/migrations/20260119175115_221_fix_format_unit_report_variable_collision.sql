/*
  # Fix format_unit_report Variable Collision Bug

  ## Problem
  The function has a declared variable `v_remaining` that collides with the subquery alias,
  causing the WHERE clause to reference the empty declared variable instead of the table alias.
  This results in battle reports not showing unit details correctly.

  ## Solution
  - Remove unused declared variables
  - Use distinct alias names in subqueries
  - Improve the logic for finding remaining units
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
  v_type_id integer;
  v_remaining_record jsonb;
BEGIN
  IF p_initial_units IS NULL OR jsonb_array_length(p_initial_units) = 0 THEN
    RETURN '  Ninguna';
  END IF;

  FOR v_unit_data IN SELECT * FROM jsonb_array_elements(p_initial_units)
  LOOP
    v_unit_name := v_unit_data->>'name';
    v_type_id := (v_unit_data->>'type_id')::integer;
    v_initial_qty := COALESCE((v_unit_data->>'initial_quantity')::integer, (v_unit_data->>'quantity')::integer, 0);
    
    IF v_initial_qty <= 0 THEN
      CONTINUE;
    END IF;
    
    v_remaining_qty := 0;
    
    IF p_remaining_units IS NOT NULL THEN
      SELECT r_unit->>'quantity' INTO v_remaining_qty
      FROM jsonb_array_elements(p_remaining_units) AS r_unit
      WHERE (r_unit->>'type_id')::integer = v_type_id
      LIMIT 1;
    END IF;
    
    v_remaining_qty := COALESCE(v_remaining_qty::integer, 0);
    
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
