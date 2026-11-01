/*
  # Admin SQL Execution Function
  
  1. New Functions
    - `exec_sql_admin`: Executes SQL statements for database restoration
      - Only callable by admin users via edge function with service role
      - Returns row count affected
  
  2. Security
    - Function uses SECURITY DEFINER to run with elevated privileges
    - Edge function validates admin status before calling
*/

CREATE OR REPLACE FUNCTION exec_sql_admin(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row_count int;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'row_count', v_row_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

REVOKE ALL ON FUNCTION exec_sql_admin(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION exec_sql_admin(text) FROM authenticated;
