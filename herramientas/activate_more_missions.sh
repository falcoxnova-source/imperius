#!/bin/sh
echo "=== Activate original free missions (variety) ==="
docker exec xnova-database psql -U postgres -d postgres -c "
UPDATE public.daily_missions 
SET is_active = true 
WHERE id IN (1, 2, 5, 7, 9, 11, 12) 
  AND cost_fxu = 0
" 2>&1

echo ""
echo "=== Now all active missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, mission_type, target_count, reward_type, reward_value, cost_fxu,
  CASE 
    WHEN reward_type = 'production_bonus' THEN '🌾 Produccion'
    WHEN reward_type = 'construction_speed_bonus' THEN '🏗️ Construccion'
    WHEN reward_type = 'research_speed_bonus' THEN '🔬 Investigacion'
    WHEN reward_type = 'fleet_speed_bonus' THEN '⚔️ Vuelo'
    ELSE '⚡ Velocidad'
  END as bonus_label
FROM public.daily_missions 
WHERE is_active = true
ORDER BY cost_fxu, id
" 2>&1

echo ""
echo "=== Summary ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT 
  CASE WHEN cost_fxu = 0 THEN 'Gratis' ELSE 'Premium' END as tipo,
  COUNT(*) as cantidad
FROM public.daily_missions WHERE is_active = true
GROUP BY CASE WHEN cost_fxu = 0 THEN 'Gratis' ELSE 'Premium' END
" 2>&1
