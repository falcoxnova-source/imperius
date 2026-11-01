#!/bin/bash
set -e
echo '=== 1. Loading backup ==='
docker cp /root/xnova/cloud_data_only.sql xnova-database:/tmp/
docker exec xnova-database psql -U postgres -d postgres -f /tmp/cloud_data_only.sql 2>&1 | tail -5

echo '=== 2. Fixing auth RLS ==='
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'auth' AND c.relkind = 'r' AND relrowsecurity = true
  LOOP
    EXECUTE 'ALTER TABLE auth.' || r.relname || ' DISABLE ROW LEVEL SECURITY';
    RAISE NOTICE 'Disabled RLS on auth.%', r.relname;
  END LOOP;
END $$;
SQL

echo '=== 3. Granting permissions ==='
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
SQL

echo '=== 4. Restart auth ==='
docker restart xnova-auth

echo '=== 5. Update password for falcoxcorp ==='
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE auth.users SET encrypted_password = '\$2b\$10\$2U5ogtO49GuKbgySeMdaS.XU7GiT20lQE7hxoYL5KFi1bcqMLr96e' WHERE email = 'falcoxcorp@gmail.com';"

echo '=== DONE ==='
