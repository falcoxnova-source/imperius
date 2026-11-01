#!/bin/bash
set -e
sed -i 's/\r$//' /tmp/deploy_autopilot_per_planet.sql
docker cp /tmp/deploy_autopilot_per_planet.sql xnova-database:/tmp/deploy_autopilot_per_planet.sql
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/deploy_autopilot_per_planet.sql
echo "=== verify column ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_name='planets' AND column_name='autopilot_enabled';"
echo "=== verify RPC ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT proname FROM pg_proc WHERE proname='set_planet_autopilot_enabled';"
echo "=== verify bot_ai_tick patched ==="
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT (position('autopilot_enabled' IN pg_get_functiondef('public.bot_ai_tick()'::regprocedure)::text) > 0) AS patched;"
echo "=== restart PostgREST for new RPC ==="
docker restart xnova-rest
echo "=== smoke test bot_ai_tick ==="
sleep 3
docker exec xnova-database psql -U postgres -d postgres -At -c "SELECT bot_ai_tick();" | head -c 400
echo ""
echo "DONE"
