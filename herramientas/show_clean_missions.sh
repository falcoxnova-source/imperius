#!/bin/sh
echo "=== Todas las misiones activas (limpias) ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT 
  CASE WHEN cost_fxu > 0 THEN '💰' ELSE '🆓' END as T,
  id,
  title_es,
  mission_type,
  target_count,
  reward_type,
  reward_value || '%' as bonus,
  reward_duration_hours || 'h' as dur
FROM public.daily_missions 
WHERE is_active = true
ORDER BY cost_fxu, id
" 2>&1
