#!/bin/bash
echo "=== Checking VPS schema_migrations ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SELECT version FROM auth.schema_migrations WHERE version = '20221208132122';
EOF
echo ""
echo "=== VPS migration count ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SELECT count(*) as total FROM auth.schema_migrations;
EOF
