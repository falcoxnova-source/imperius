#!/bin/bash
set -e

echo "=== Setting proper SCRAM password ==="
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
-- Force SCRAM-SHA-256 password
SET password_encryption = 'scram-sha-256';
ALTER USER supabase_auth_admin WITH PASSWORD 'xnova123';

-- Verify the password hash
SELECT usename, passwd IS NOT NULL as has_password FROM pg_shadow WHERE usename = 'supabase_auth_admin';
SQL

echo "=== Testing TCP connection (SCRAM) ==="
docker exec xnova-database psql -h 127.0.0.1 -U supabase_auth_admin -d postgres -c "SELECT 'TCP_OK' as conn;"

echo "=== Reload pg_hba ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 6
echo "=== Auth logs ==="
docker logs xnova-auth --tail 8
