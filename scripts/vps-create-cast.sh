#!/bin/bash
set -e
echo "=== Creating uuid = text operator ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Create cast from uuid to text (implicit)
CREATE CAST (uuid AS text) WITH INOUT AS IMPLICIT;

-- Test
SELECT '550e8400-e29b-41d4-a716-446655440000'::uuid = '550e8400-e29b-41d4-a716-446655440000' as test_result;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 10
echo "=== Auth logs ==="
docker logs xnova-auth --tail 8
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
