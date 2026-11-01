#!/bin/bash
set -e
echo "=== Replacing pg_hba.conf completely ==="
docker stop xnova-auth 2>/dev/null || true

docker exec xnova-database bash -c 'cat > /var/lib/postgresql/data/pg_hba.conf << EOFTRUST
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
EOFTRUST'

docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"
echo "=== Testing ==="
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'OK' as conn;"
echo "=== Starting auth ==="
docker start xnova-auth
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova
