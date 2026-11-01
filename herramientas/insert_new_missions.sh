#!/bin/sh
echo "=== Inserting 4 new hard daily missions ==="

docker exec xnova-database psql -U postgres -d postgres << 'SQLEOF'
-- 1. Production Speed: Collect 1M metal
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('collect_metal_1m', 'collect_metal', 1000000, 'production_bonus', 5, 24, 
  '⛏️ Titán de la Minería', 
  'Recolecta 1,000,000 de metal para activar +5% velocidad de producción durante 24h.',
  'Pickaxe', true, 0)
ON CONFLICT (code) DO NOTHING;

-- 2. Construction Speed: Build 12 building levels
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('build_12', 'build', 12, 'construction_speed_bonus', 5, 24,
  '🏗️ Arquitecto Supremo',
  'Construye 12 niveles de edificios para activar +5% velocidad de construcción durante 24h.',
  'Building', true, 0)
ON CONFLICT (code) DO NOTHING;

-- 3. Research Speed: Research 8 tech levels
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('research_8', 'research', 8, 'research_speed_bonus', 5, 24,
  '🔬 Mente Maestra',
  'Investiga 8 niveles de tecnologías para activar +5% velocidad de investigación durante 24h.',
  'FlaskConical', true, 0)
ON CONFLICT (code) DO NOTHING;

-- 4. Fleet Speed: Attack 15 enemy fleets
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('attack_15', 'attack', 15, 'fleet_speed_bonus', 5, 24,
  '⚔️ Señor de la Guerra',
  'Ataca 15 flotas enemigas para activar +5% velocidad de vuelo durante 24h.',
  'Swords', true, 0)
ON CONFLICT (code) DO NOTHING;
SQLEOF

echo ""
echo "=== Verify inserted missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, is_active, cost_fxu
FROM public.daily_missions
WHERE code IN ('collect_metal_1m', 'build_12', 'research_8', 'attack_15')
ORDER BY id
" 2>&1

echo ""
echo "=== Count active missions ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT is_active, cost_fxu, COUNT(*) 
FROM public.daily_missions 
GROUP BY is_active, cost_fxu 
ORDER BY is_active DESC, cost_fxu
" 2>&1

echo ""
echo "=== Done ==="
