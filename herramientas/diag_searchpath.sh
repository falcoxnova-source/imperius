#!/bin/bash
PSQL="docker exec xnova-database psql -U postgres -d postgres"

echo "=== 1. bot_ai_tick proconfig (own search_path?) ==="
$PSQL -c "SELECT proname, proconfig FROM pg_proc WHERE proname='bot_ai_tick';"

echo
echo "=== 2. set_planet_autopilot_role proconfig ==="
$PSQL -c "SELECT proname, proconfig FROM pg_proc WHERE proname='set_planet_autopilot_role';"

echo
echo "=== 3. DB and role default search_path ==="
$PSQL -c "SELECT datname, datconfig FROM pg_database WHERE datname='postgres';"
$PSQL -c "SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('postgres','authenticator','authenticated','anon','service_role');"

echo
echo "=== 4. Run bot_ai_tick with explicit public search_path ==="
$PSQL -c "SET search_path = public; SELECT public.bot_ai_tick();"
echo "EXIT: $?"
