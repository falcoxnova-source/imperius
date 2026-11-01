#!/bin/sh
docker exec xnova-database psql -U postgres -d postgres -c "SELECT 'get_daily_streak_status' as func, prosrc LIKE '%daily_streak_cost%' as reads_setting FROM pg_proc WHERE proname = 'get_daily_streak_status'"
echo ""
docker exec xnova-database psql -U postgres -d postgres -c "SELECT 'activate_daily_streak' as func, prosrc LIKE '%daily_streak_cost%' as reads_setting FROM pg_proc WHERE proname = 'activate_daily_streak'"
echo ""
echo "=== Setting value ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT key, value FROM public.game_settings WHERE key = 'daily_streak_cost'"
