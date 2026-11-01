/*
  # Helper function for database backup

  1. New Functions
    - `get_all_public_tables` - Returns all table names in the public schema
      - Used by the database-backup edge function to dynamically discover tables
      - Ensures no tables are missed during backup

  2. Security
    - Function is accessible to authenticated users
    - Only returns table names, no sensitive data
*/

CREATE OR REPLACE FUNCTION get_all_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;

GRANT EXECUTE ON FUNCTION get_all_public_tables() TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_public_tables() TO service_role;
