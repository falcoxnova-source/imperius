#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
echo "=== Backup set_planet_autopilot_role + constraint + bot_ai_tick config ==="
docker exec xnova-database psql -U postgres -d postgres -t -A \
  -c "SELECT pg_get_functiondef('public.set_planet_autopilot_role(uuid,text)'::regprocedure);" \
  > /tmp/backup_setrole_$TS.sql
docker exec xnova-database psql -U postgres -d postgres -t -A \
  -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='planets_autopilot_role_check';" \
  >> /tmp/backup_setrole_$TS.sql
echo "Backup -> /tmp/backup_setrole_$TS.sql"

echo "=== Apply fix ==="
docker cp /tmp/fix_autopilot.sql xnova-database:/tmp/fix_autopilot.sql
docker exec xnova-database psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/fix_autopilot.sql
echo "APPLY EXIT: $?"

echo
echo "=== Verify bot_ai_tick proconfig now ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT proname, proconfig FROM pg_proc WHERE proname='bot_ai_tick';"

echo "=== Verify constraint now ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='planets_autopilot_role_check';"

echo "=== Run bot_ai_tick as postgres (default search_path) to confirm it no longer crashes ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT public.bot_ai_tick();"
echo "TICK EXIT: $?"
