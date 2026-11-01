#!/bin/bash
set -e
echo "=== Switching GoTrue to use postgres superuser ==="
cd /root/xnova

# Update docker-compose.yml to use postgres user
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://postgres:xnova123@database:5432/postgres|' docker-compose.yml

# Verify change
grep GOTRUE_DB_DATABASE docker-compose.yml

# Recreate auth container
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 8

echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo ""
echo "=== Status ==="
docker ps
