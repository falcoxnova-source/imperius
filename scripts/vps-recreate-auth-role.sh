#!/bin/bash
set -e

echo "=== Dropping and recreating supabase_auth_admin ==="
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
-- Drop and recreate the role with proper SCRAM password
DROP ROLE IF EXISTS supabase_auth_admin;
CREATE ROLE supabase_auth_admin WITH LOGIN PASSWORD 'xnova123' NOINHERIT CREATEROLE;
GRANT supabase_auth_admin TO postgres;
SQL

echo "=== Testing connection ==="
docker exec xnova-database psql -h localhost -U supabase_auth_admin -d postgres -c "SELECT 'OK' as conn;"

echo "=== Fix ownerships ==="
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO supabase_auth_admin;
SQL

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 6
docker logs xnova-auth --tail 5
