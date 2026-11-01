#!/bin/sh
echo "=== game_settings table ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'game_settings'
ORDER BY ordinal_position
" 2>&1

echo ""
echo "=== Existing settings ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT key, value
FROM public.game_settings
ORDER BY key
" 2>&1

echo ""
echo "=== user_daily_streaks table ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_daily_streaks'
ORDER BY ordinal_position
" 2>&1
