#!/bin/bash
set -e
echo "=== Restoring from local working DB dump ==="

# Stop services
docker stop xnova-auth xnova-rest 2>/dev/null || true
sleep 2

# Drop and recreate
docker exec xnova-database psql -U postgres -d template1 <<'EOF'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'postgres' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS postgres;
CREATE DATABASE postgres OWNER postgres;
EOF

# Copy and restore
docker cp /root/xnova/local-db.sql xnova-database:/tmp/
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=off -f /tmp/local-db.sql 2>&1 | tail -5

# Fix GoTrue to use postgres user (from our local working config)
cd /root/xnova
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://postgres:xnova123@database:5432/postgres|' docker-compose.yml
grep GOTRUE_DB_DATABASE docker-compose.yml

# Start services
docker restart xnova-auth xnova-rest
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps
