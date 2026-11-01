#!/bin/bash
echo "=== Fixing GoTrue migration ==="
# Mark the problematic migration as completed
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
INSERT INTO auth.schema_migrations (version) VALUES ('20221208132122') ON CONFLICT DO NOTHING;
EOF

echo "=== Restart auth ==="
docker restart xnova-auth
sleep 8
echo "=== Auth logs ==="
docker logs xnova-auth --tail 10
echo "=== Status ==="
docker ps --filter name=xnova-auth --format '{{.Status}}'
