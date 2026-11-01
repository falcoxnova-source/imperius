#!/bin/bash
echo "=== BEFORE ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT rolname, rolconfig FROM pg_roles WHERE rolname='postgres';"

echo "=== FIX: restore intended search_path (auth, public) ==="
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE postgres SET search_path = auth, public;"

echo "=== AFTER (new sessions) ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT rolname, rolconfig FROM pg_roles WHERE rolname='postgres';"

echo "=== Verify unqualified resolution works in a fresh session ==="
docker exec xnova-database psql -U postgres -d postgres -c "SHOW search_path;"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT count(*) AS planets_count FROM planets;"
docker exec xnova-database psql -U postgres -d postgres -c "SELECT count(*) AS custom_orders FROM ai_planet_custom_orders;"

echo "=== bot_ai_tick still fine ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT public.bot_ai_tick();"
