#!/bin/bash
echo "=== GoTrue (auth) image/version ==="
docker inspect xnova-auth --format '{{.Config.Image}}'
docker exec xnova-auth gotrue --version 2>/dev/null || docker exec xnova-auth /usr/local/bin/auth --version 2>/dev/null || echo "(version cmd not available)"

echo
echo "=== auth.sessions columns ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='auth' AND table_name='sessions' ORDER BY ordinal_position;"

echo "=== does auth.sessions have oauth_client_id? ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT to_regclass('auth.oauth_clients') AS oauth_clients_table; SELECT count(*) FILTER (WHERE column_name='oauth_client_id') AS has_oauth_client_id FROM information_schema.columns WHERE table_schema='auth' AND table_name='sessions';"

echo "=== last applied auth migrations ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT version FROM auth.schema_migrations ORDER BY version DESC LIMIT 15;"
