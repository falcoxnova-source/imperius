#!/bin/bash
cd /root/xnova

echo "=== Creating auth.schema_migrations fresh ==="
docker exec xnova-database psql -U postgres -d postgres <<'EOF'
-- Recreate schema_migrations table in auth schema
CREATE TABLE IF NOT EXISTS auth.schema_migrations (version VARCHAR(14) PRIMARY KEY);
INSERT INTO auth.schema_migrations VALUES ('20221208132122') ON CONFLICT DO NOTHING;
EOF

echo "=== Switch to supabase_auth_admin + pg_hba trust ==="
# Ensure pg_hba is fixed
docker exec xnova-database bash -c "echo 'host all all 0.0.0.0/0 trust' >> /etc/postgresql/pg_hba.conf"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_reload_conf();"

# Set search_path
docker exec xnova-database psql -U postgres -d postgres -c "ALTER USER supabase_auth_admin SET search_path = 'auth';"

# Use supabase_auth_admin
sed -i 's|GOTRUE_DB_DATABASE_URL:.*|GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:xnova123@database:5432/postgres|' docker-compose.yml

docker compose --profile self-hosted up -d --force-recreate auth 2>&1 | tail -5
sleep 10
docker logs xnova-auth --tail 5
docker ps --filter name=xnova-auth --format '{{.Status}}'
