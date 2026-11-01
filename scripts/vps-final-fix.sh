#!/bin/bash
set -e
echo "============================================"
echo "  XNOVA VPS FINAL SETUP"
echo "============================================"

# 1. Fix pg_hba.conf - the image generates invalid line
echo "=== 1. Fixing pg_hba.conf ==="
docker exec xnova-database bash -c "sed -i 's|host all all all trust|host all all 0.0.0.0/0 trust|' /var/lib/postgresql/data/pg_hba.conf"
docker exec xnova-database grep "0.0.0.0/0" /var/lib/postgresql/data/pg_hba.conf
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

# 2. Set passwords
echo "=== 2. Setting passwords ==="
docker exec xnova-database psql -U postgres -d postgres <<'SQL'
ALTER USER postgres WITH PASSWORD 'xnova123';
ALTER USER supabase_auth_admin WITH PASSWORD 'xnova123';
ALTER USER authenticator WITH PASSWORD 'xnova123';
SQL

# 3. Test TCP connection
echo "=== 3. Testing TCP connection ==="
docker exec xnova-database psql -h database -U postgres -d postgres -c "SELECT 'TCP_OK' as status;"

# 4. Fix GoTrue to use postgres user
echo "=== 4. Updating GoTrue config ==="
cd /root/xnova
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://postgres:xnova123@database:5432/postgres|' docker-compose.yml

# 5. Recreate auth
echo "=== 5. Recreating auth ==="
docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -3
sleep 8

# 6. Check
echo "=== 6. Auth status ==="
docker logs xnova-auth --tail 5
echo ""
docker ps --filter name=xnova --format "table {{.Names}}\t{{.Status}}"
