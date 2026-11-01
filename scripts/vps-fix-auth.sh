#!/bin/bash
set -e

echo "=== Fixing auth ==="

# Fix supabase_auth_admin password
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
ALTER USER supabase_auth_admin WITH PASSWORD 'xnova123';
GRANT ALL PRIVILEGES ON DATABASE postgres TO supabase_auth_admin;
GRANT ALL PRIVILEGES ON SCHEMA auth TO supabase_auth_admin;
ALTER SCHEMA auth OWNER TO supabase_auth_admin;
SQL

echo "=== Testing connection as supabase_auth_admin ==="
docker exec xnova-database psql -h localhost -U supabase_auth_admin -d postgres -c "SELECT 'CONNECTION_OK' as status;"

echo "=== Restarting auth ==="
docker restart xnova-auth
sleep 5
docker logs xnova-auth --tail 5

echo "=== Auth status ==="
docker ps --filter name=xnova-auth
