#!/bin/bash
echo "=== Checking identities column types ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SELECT column_name, data_type, udt_name 
FROM information_schema.columns 
WHERE table_schema = 'auth' AND table_name = 'identities' 
ORDER BY ordinal_position;
EOF
echo ""
echo "=== Checking if migration exists in schema_migrations ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
SELECT version FROM auth.schema_migrations ORDER BY version;
EOF
