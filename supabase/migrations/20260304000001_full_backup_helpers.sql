/*
  # Helper functions for COMPLETE database backup
  
  Creates RPC functions to export the full database structure:
  - get_database_extensions() - All installed extensions
  - get_custom_types() - ENUM types and composite types
  - get_table_ddl() - Full CREATE TABLE statements
  - get_all_indexes() - All indexes
  - get_all_constraints() - FK, UNIQUE, CHECK constraints
  - get_all_functions() - All user-defined functions
  - get_all_triggers() - All triggers
  - get_all_views() - All views with definitions
  - get_all_rls_policies() - All RLS policies
  - get_all_sequences_state() - Sequence current values
  - get_all_grants() - Table-level permissions
  - get_rls_status() - RLS enabled/disabled per table
*/

-- 1. Get installed extensions
CREATE OR REPLACE FUNCTION get_database_extensions()
RETURNS TABLE(ext_name text, ext_schema text, ext_version text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT e.extname::text, n.nspname::text, e.extversion::text
  FROM pg_extension e
  JOIN pg_namespace n ON e.extnamespace = n.oid
  WHERE e.extname != 'plpgsql'
  ORDER BY e.extname;
$$;

-- 2. Get custom ENUM types
CREATE OR REPLACE FUNCTION get_custom_types()
RETURNS TABLE(type_name text, type_schema text, enum_values text[], type_kind text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    t.typname::text,
    n.nspname::text,
    ARRAY(
      SELECT e.enumlabel::text 
      FROM pg_enum e 
      WHERE e.enumtypid = t.oid 
      ORDER BY e.enumsortorder
    ),
    CASE t.typtype 
      WHEN 'e' THEN 'enum'
      WHEN 'c' THEN 'composite'
      ELSE t.typtype::text
    END
  FROM pg_type t
  JOIN pg_namespace n ON t.typnamespace = n.oid
  WHERE n.nspname = 'public'
    AND t.typtype IN ('e', 'c')
  ORDER BY t.typname;
$$;

-- 3. Get full table DDL via information_schema
CREATE OR REPLACE FUNCTION get_table_columns_detail()
RETURNS TABLE(
  tbl_name text,
  col_name text,
  col_position integer,
  col_default text,
  is_nullable text,
  data_type text,
  char_max_length integer,
  numeric_precision integer,
  numeric_scale integer,
  udt_name text,
  is_identity text,
  identity_generation text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    c.table_name::text,
    c.column_name::text,
    c.ordinal_position::integer,
    c.column_default::text,
    c.is_nullable::text,
    c.data_type::text,
    c.character_maximum_length::integer,
    c.numeric_precision::integer,
    c.numeric_scale::integer,
    c.udt_name::text,
    c.is_identity::text,
    c.identity_generation::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
$$;

-- 4. Get all indexes
CREATE OR REPLACE FUNCTION get_all_indexes()
RETURNS TABLE(table_name text, index_name text, index_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    t.relname::text,
    i.relname::text,
    pg_get_indexdef(ix.indexrelid)::text
  FROM pg_index ix
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND NOT ix.indisprimary  -- Exclude primary keys (handled in CREATE TABLE)
    AND NOT ix.indisunique   -- Exclude unique constraints (handled separately)
  ORDER BY t.relname, i.relname;
$$;

-- 5. Get all unique indexes (not from constraints)
CREATE OR REPLACE FUNCTION get_all_unique_indexes()
RETURNS TABLE(table_name text, index_name text, index_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    t.relname::text,
    i.relname::text,
    pg_get_indexdef(ix.indexrelid)::text
  FROM pg_index ix
  JOIN pg_class t ON t.oid = ix.indrelid
  JOIN pg_class i ON i.oid = ix.indexrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  LEFT JOIN pg_constraint c ON c.conindid = ix.indexrelid
  WHERE n.nspname = 'public'
    AND ix.indisunique
    AND NOT ix.indisprimary
    AND c.oid IS NULL  -- Not backing a constraint
  ORDER BY t.relname, i.relname;
$$;

-- 6. Get all constraints (FK, UNIQUE, CHECK) with full definitions
CREATE OR REPLACE FUNCTION get_all_constraints()
RETURNS TABLE(
  table_name text,
  constraint_name text, 
  constraint_type text,
  constraint_def text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cl.relname::text,
    co.conname::text,
    CASE co.contype
      WHEN 'f' THEN 'FOREIGN KEY'
      WHEN 'u' THEN 'UNIQUE'
      WHEN 'c' THEN 'CHECK'
      WHEN 'p' THEN 'PRIMARY KEY'
      ELSE co.contype::text
    END,
    pg_get_constraintdef(co.oid, true)::text
  FROM pg_constraint co
  JOIN pg_class cl ON cl.oid = co.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public'
  ORDER BY cl.relname, co.contype, co.conname;
$$;

-- 7. Get all user-defined functions
CREATE OR REPLACE FUNCTION get_all_functions()
RETURNS TABLE(func_name text, func_schema text, func_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    p.proname::text,
    n.nspname::text,
    pg_get_functiondef(p.oid)::text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prokind IN ('f', 'p')  -- functions and procedures
    AND p.proname NOT LIKE 'pg_%'
  ORDER BY p.proname;
$$;

-- 8. Get all triggers
CREATE OR REPLACE FUNCTION get_all_triggers()
RETURNS TABLE(trigger_name text, table_name text, trigger_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    t.tgname::text,
    c.relname::text,
    pg_get_triggerdef(t.oid, true)::text
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
  ORDER BY c.relname, t.tgname;
$$;

-- 9. Get all views
CREATE OR REPLACE FUNCTION get_all_views()
RETURNS TABLE(view_name text, view_def text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    v.viewname::text,
    v.definition::text
  FROM pg_views v
  WHERE v.schemaname = 'public'
  ORDER BY v.viewname;
$$;

-- 10. Get all RLS policies
CREATE OR REPLACE FUNCTION get_all_rls_policies()
RETURNS TABLE(
  table_name text,
  policy_name text,
  policy_permissive text,
  policy_roles text[],
  policy_cmd text,
  policy_qual text,
  policy_with_check text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    schemaname || '.' || tablename as table_name,
    policyname::text,
    permissive::text,
    roles::text[],
    cmd::text,
    qual::text,
    with_check::text
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
$$;

-- 11. Get all sequence current values
CREATE OR REPLACE FUNCTION get_all_sequences_state()
RETURNS TABLE(seq_name text, seq_last_value bigint, seq_start_value bigint, seq_increment bigint, seq_max_value bigint, seq_min_value bigint, seq_cycle boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec record;
BEGIN
  FOR rec IN 
    SELECT s.relname::text as sname
    FROM pg_class s
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE s.relkind = 'S' AND n.nspname = 'public'
    ORDER BY s.relname
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT %L::text, last_value, start_value, increment_by, max_value, min_value, is_cycled FROM public.%I',
      rec.sname, rec.sname
    );
  END LOOP;
END;
$$;

-- 12. Get RLS enabled status per table
CREATE OR REPLACE FUNCTION get_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean, rls_forced boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    c.relname::text,
    c.relrowsecurity,
    c.relforcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'  -- regular tables only
  ORDER BY c.relname;
$$;

-- 13. Get table grants/permissions
CREATE OR REPLACE FUNCTION get_all_grants()
RETURNS TABLE(table_name text, grantee text, privilege_type text, is_grantable text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 
    tp.table_name::text,
    tp.grantee::text,
    tp.privilege_type::text,
    tp.is_grantable::text
  FROM information_schema.table_privileges tp
  WHERE tp.table_schema = 'public'
    AND tp.grantee NOT IN ('postgres', 'supabase_admin')
  ORDER BY tp.table_name, tp.grantee, tp.privilege_type;
$$;

-- Grant execute to service_role for all new functions
GRANT EXECUTE ON FUNCTION get_database_extensions() TO service_role;
GRANT EXECUTE ON FUNCTION get_custom_types() TO service_role;
GRANT EXECUTE ON FUNCTION get_table_columns_detail() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_indexes() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_unique_indexes() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_constraints() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_functions() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_triggers() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_views() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_rls_policies() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_sequences_state() TO service_role;
GRANT EXECUTE ON FUNCTION get_rls_status() TO service_role;
GRANT EXECUTE ON FUNCTION get_all_grants() TO service_role;
