#!/bin/bash
set -e
echo "=== 1. Check hba_file location ==="
HBA=$(docker exec xnova-database psql -U postgres -t -A -c "SHOW hba_file;")
echo "hba_file = $HBA"

echo "=== 2. Stop auth ==="
docker stop xnova-auth 2>/dev/null || true

echo "=== 3. Overwrite pg_hba.conf ==="
docker exec xnova-database bash -c "cat > $HBA << 'EOFTRUST'
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
local   replication     all                                     trust
host    replication     all             127.0.0.1/32            trust
host    replication     all             ::1/128                 trust
host    all             all             0.0.0.0/0               trust
EOFTRUST"

echo "=== 4. Verify file ==="
docker exec xnova-database tail -5 $HBA

echo "=== 5. Reload ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"
sleep 2

echo "=== 6. Test connection from auth container network ==="
# Use a temp container on the same network
docker run --rm --network xnova-game_xnova-internal alpine wget -q -O- --timeout=3 http://database:5432 2>&1 || echo "(cannot http to PG, trying psql via db container)"
docker exec xnova-database psql -h database -U supabase_auth_admin -d postgres -c "SELECT 'TRUST_OK' as conn;" 2>&1 || echo "FAILED"

echo "=== 7. Start auth ==="
docker start xnova-auth
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
