#!/bin/bash
set -e
echo "=== Checking auth.identities schema ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'identities' ORDER BY ordinal_position;
EOF

echo "=== Creating text = uuid cast ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Create cast from text to uuid
CREATE CAST (text AS uuid) WITH INOUT AS IMPLICIT;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
echo "=== Auth logs (last 5) ==="
docker logs xnova-auth --tail 5
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
