#!/bin/bash
set -e
echo "=== Setting up authenticator role for GoTrue ==="

# Set password
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
ALTER USER authenticator WITH PASSWORD 'xnova123';
GRANT ALL PRIVILEGES ON DATABASE postgres TO authenticator;
GRANT ALL PRIVILEGES ON SCHEMA auth TO authenticator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO authenticator;
SQL

# Test connection from network
docker exec xnova-database psql -h database -U authenticator -d postgres -c "SELECT 'AUTH_OK' as status;"

echo "=== Updating GoTrue config to use authenticator ==="
cd /root/xnova
sed -i 's|postgres://supabase_auth_admin:.*@database|postgres://authenticator:xnova123@database|g' docker-compose.yml

echo "=== Recreating auth container ==="
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5

sleep 8
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps --filter name=xnova
