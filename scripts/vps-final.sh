#!/bin/bash
cd /root/xnova

echo "=== Using postgres with auth in search_path ==="
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://postgres:xnova123@database:5432/postgres|' docker-compose.yml

# Set search_path for postgres to include auth
docker exec xnova-database psql -U postgres -d postgres -c "ALTER USER postgres SET search_path = 'auth, public';"

# Also fix: drop auth.schema_migrations so GoTrue can create it fresh (with postgres user)
docker exec xnova-database psql -U postgres -d postgres -c "DROP TABLE IF EXISTS auth.schema_migrations CASCADE;"

docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
