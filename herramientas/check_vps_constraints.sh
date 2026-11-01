#!/bin/sh
echo "=== Check VPS DB constraints ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'daily_missions'::regclass
ORDER BY conname
" 2>&1

echo ""
echo "=== Check user_active_bonuses constraints ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT conname, pg_get_constraintdef(oid) as constraint_def
FROM pg_constraint
WHERE conrelid = 'user_active_bonuses'::regclass
ORDER BY conname
" 2>&1

echo ""
echo "=== Check existing distinct reward_types ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT DISTINCT reward_type FROM public.daily_missions
" 2>&1

echo ""
echo "=== Check existing distinct mission_types ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT DISTINCT mission_type FROM public.daily_missions
" 2>&1

echo ""
echo "=== Check existing distinct bonus_types ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT DISTINCT bonus_type FROM public.user_active_bonuses
" 2>&1
