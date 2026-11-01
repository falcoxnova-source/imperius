#!/bin/bash
set -e
echo "=== Resetting VPS database from local working copy ==="

echo "=== 1. Stop services ==="
docker stop xnova-auth xnova-rest 2>/dev/null || true

echo "=== 2. Drop and recreate ==="
docker exec xnova-database psql -U postgres -d template1 <<'EOF'
DROP DATABASE postgres;
CREATE DATABASE postgres OWNER postgres;
EOF

echo "=== 3. Restore from dump ==="
docker cp /root/xnova/local-db-working.sql xnova-database:/tmp/
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=off -f /tmp/local-db-working.sql 2>&1 | tail -10

echo "=== 4. Restart services ==="
docker restart xnova-auth
sleep 8
docker logs xnova-auth --tail 5
echo ""
docker ps
