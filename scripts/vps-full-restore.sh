#!/bin/bash
set -e
echo "=== Dropping existing schemas (will be recreated by backup) ==="
docker exec xnova-database psql -U postgres -d postgres -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS realtime CASCADE; DROP SCHEMA IF EXISTS storage CASCADE;'

echo "=== Creating base schemas ==="
docker exec xnova-database psql -U postgres -d postgres -c 'CREATE SCHEMA public; CREATE SCHEMA auth; CREATE SCHEMA realtime; CREATE SCHEMA storage;'

echo "=== Loading FULL backup ==="
docker exec -i xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=off < /root/xnova/cloud_backup.sql 2>&1 | grep -E '(ERROR|setval|CREATE|INSERT)' | tail -20

echo "=== Re-applying fixes ==="
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
-- Fix auth RLS
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relkind = 'r' AND relrowsecurity = true
  LOOP
    EXECUTE 'ALTER TABLE auth.' || r.relname || ' DISABLE ROW LEVEL SECURITY';
  END LOOP;
END $$;

-- Grant public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Grant auth schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;

-- Update password
UPDATE auth.users SET encrypted_password = '\$2b\$10\$2U5ogtO49GuKbgySeMdaS.XU7GiT20lQE7hxoYL5KFi1bcqMLr96e' WHERE email = 'falcoxcorp@gmail.com';
SQL

echo "=== Restarting auth ==="
docker restart xnova-auth
echo "=== DONE ==="
