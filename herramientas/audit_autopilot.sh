#!/bin/bash
PSQL="docker exec xnova-database psql -U postgres -d postgres"

echo "=== 1. autopilot_role constraint on planets ==="
$PSQL -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.planets'::regclass AND conname LIKE '%autopilot%';"

echo
echo "=== 2. set_planet_autopilot_role definition ==="
$PSQL -c "SELECT pg_get_functiondef('public.set_planet_autopilot_role(uuid,text)'::regprocedure);"

echo
echo "=== 3. bot_ai_tick deployed - line count + comment ==="
$PSQL -c "SELECT length(pg_get_functiondef('public.bot_ai_tick()'::regprocedure)) AS def_len, obj_description('public.bot_ai_tick()'::regprocedure) AS comment;"

echo
echo "=== 4. bot_ai_tick md5 ==="
$PSQL -tA -c "SELECT md5(pg_get_functiondef('public.bot_ai_tick()'::regprocedure));"

echo
echo "=== 5. distinct autopilot_role values currently in use ==="
$PSQL -c "SELECT autopilot_role, count(*) FROM public.planets GROUP BY autopilot_role ORDER BY 2 DESC;"

echo
echo "=== 6. autopilot custom config columns/tables ==="
$PSQL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='planets' AND column_name LIKE '%custom%' OR (table_name='planets' AND column_name LIKE '%autopilot%');"
$PSQL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%autopilot%' OR table_name LIKE '%custom%');"

echo
echo "=== 7. active human autopilots ==="
$PSQL -c "SELECT id, username, autopilot_active, autopilot_eligible, autopilot_vip_boost FROM public.profiles WHERE autopilot_active=true LIMIT 20;"

echo
echo "=== 8. bots count ==="
$PSQL -c "SELECT count(*) AS bot_count FROM public.profiles WHERE is_bot=true;"
