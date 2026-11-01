DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relkind = 'r' AND relrowsecurity = true
  LOOP
    EXECUTE 'ALTER TABLE auth.' || r.relname || ' DISABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'Disabled RLS on auth.%', r.relname;
  END LOOP;
END $$;
