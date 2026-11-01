#!/bin/bash
cd /root/xnova

# Revert to supabase_auth_admin
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:xnova123@database:5432/postgres|' docker-compose.yml
grep GOTRUE_DB_DATABASE docker-compose.yml

# Set search_path for supabase_auth_admin
docker exec xnova-database psql -U postgres -d postgres -c "ALTER USER supabase_auth_admin SET search_path = 'auth';"

# Recreate auth
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 8
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
