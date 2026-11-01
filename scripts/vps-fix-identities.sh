#!/bin/bash
set -e
echo "=== Fixing GoTrue migration issue ==="

# Fix the migration by making it a no-op
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Make the migration a no-op by setting all last_sign_in_at
UPDATE auth.identities SET last_sign_in_at = created_at WHERE last_sign_in_at IS NULL;

-- Now manually apply the migration
DROP TABLE IF EXISTS auth._migration_fix;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
echo "=== Auth logs (last 5) ==="
docker logs xnova-auth --tail 5 2>&1
echo ""
echo "=== Auth container status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
