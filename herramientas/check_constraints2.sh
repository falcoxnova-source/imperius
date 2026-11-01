#!/bin/sh
echo "=== Check daily_missions constraints ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.daily_missions'::regclass ORDER BY conname" 2>&1

echo ""
echo "=== Check user_active_bonuses constraints ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.user_active_bonuses'::regclass ORDER BY conname" 2>&1

echo ""
echo "=== Check if cost_fxu column exists ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_missions' AND column_name = 'cost_fxu'" 2>&1

echo ""
echo "=== Check if is_premium column exists ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'daily_missions' AND column_name = 'is_premium'" 2>&1
