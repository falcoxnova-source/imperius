/*
  # Admin Reset Monthly Sales

  ## Summary
  Adds a function for admins to reset all monthly sales counters for the current month.
  This is needed when the admin changes monthly limits and wants to clear accumulated totals.

  ## Changes
  1. New Function
    - `admin_reset_monthly_sales()`: Resets all users' monthly sales counters for the current month to zero

  ## Important Notes
  - Only admins can execute this function
  - Only affects the current month's records
  - Historical months are not touched
*/

CREATE OR REPLACE FUNCTION admin_reset_monthly_sales()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_year_month text;
  v_affected int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;

  v_year_month := to_char(now(), 'YYYY-MM');

  UPDATE market_monthly_sales
  SET metal_sold = 0,
      crystal_sold = 0,
      deuterium_sold = 0,
      updated_at = now()
  WHERE year_month = v_year_month;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Se reiniciaron los contadores de ' || v_affected || ' usuarios para el mes ' || v_year_month
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_monthly_sales() TO authenticated;
