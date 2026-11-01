#!/bin/bash
set -e
echo "=== Stopping all services ==="
docker stop xnova-auth xnova-rest xnova-database 2>/dev/null || true

echo "=== Removing old data ==="
docker rm xnova-database 2>/dev/null || true
docker volume rm xnova-game_database-data 2>/dev/null || true

echo "=== Creating fresh volume ==="
docker volume create xnova-game_database-data

echo "=== Extracting local data ==="
docker run --rm -v xnova-game_database-data:/data -v /root/xnova:/backup:ro alpine tar xzf /backup/xnova-pgdata.tar.gz -C /data

echo "=== Starting database ==="
cd /root/xnova
docker compose --profile self-hosted up -d database 2>&1 | tail -5
sleep 5

echo "=== Starting auth ==="
# Revert GoTrue to use supabase_auth_admin (the local DB has the right password)
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:xnova123@database:5432/postgres|' docker-compose.yml
docker compose --profile self-hosted up -d auth 2>&1 | tail -5
sleep 10

echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo ""
echo "=== Status ==="
docker ps
