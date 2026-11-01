#!/bin/sh
echo "=== Deactivate old missions, keep only 4 new ones ==="
docker exec xnova-database psql -U postgres -d postgres -c "
UPDATE public.daily_missions 
SET is_active = false 
WHERE id IN (1, 2, 5, 7, 9, 11, 12)
" 2>&1

echo ""
echo "=== Active free missions (should be 4) ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, title_es, mission_type, target_count, reward_type, reward_value || '% ' || reward_duration_hours || 'h' as bonus
FROM public.daily_missions 
WHERE is_active = true AND cost_fxu = 0
ORDER BY id
" 2>&1

echo ""
echo "=== Total active ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT 
  CASE WHEN cost_fxu = 0 THEN 'Gratis' ELSE 'Premium' END,
  COUNT(*)
FROM public.daily_missions WHERE is_active = true
GROUP BY 1
" 2>&1
