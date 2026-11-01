#!/bin/bash
cd /root/xnova

# Update GoTrue to use postgres superuser
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://postgres:xnova123@database:5432/postgres|' docker-compose.yml
grep GOTRUE_DB docker-compose.yml

# Recreate auth
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 10

echo "=== Auth logs ==="
docker logs xnova-auth --tail 8
echo ""
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
