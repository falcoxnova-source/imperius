#!/bin/sh
echo "=== 1. Daily missions table structure ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'daily_missions'
ORDER BY ordinal_position
" 2>&1

echo ""
echo "=== 2. Existing missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, is_active, cost_fxu
FROM public.daily_missions
ORDER BY id
" 2>&1

echo ""
echo "=== 3. User active bonuses table ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_active_bonuses'
ORDER BY ordinal_position
" 2>&1

echo ""
echo "=== 4. Active bonuses for existing missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT * FROM public.user_active_bonuses LIMIT 5
" 2>&1
