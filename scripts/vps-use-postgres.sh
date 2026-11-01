#!/bin/bash
set -e
echo "=== Setting postgres password and using it for GoTrue ==="

# Set postgres password for TCP connections
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
ALTER USER postgres WITH PASSWORD 'xnova123';
SQL

# Test TCP connection as postgres
docker exec xnova-database psql -h database -U postgres -d postgres -c "SELECT 'PG_OK' as status;"

echo "=== Updating GoTrue to use postgres user ==="
cd /root/xnova
sed -i 's|postgres://supabase_auth_admin:.*@database|postgres://postgres:xnova123@database|g' docker-compose.yml

echo "=== Recreating auth ==="
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 8
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps
