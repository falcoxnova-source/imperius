#!/bin/bash
PSQL="docker exec xnova-database psql -U postgres -d postgres"

echo "=== Run bot_ai_tick() on VPS (safe: filters to bots/active autopilots) ==="
$PSQL -c "SELECT public.bot_ai_tick();"
echo "EXIT: $?"
