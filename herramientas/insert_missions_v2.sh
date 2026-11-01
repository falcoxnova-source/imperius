#!/bin/sh
echo "=== Check if codes already exist ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT code FROM public.daily_missions WHERE code IN ('collect_metal_1m', 'build_12', 'research_8', 'attack_15')" 2>&1

echo ""
echo "=== Insert manually with explicit SQL ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('collect_metal_1m', 'collect_metal', 1000000, 'production_bonus', 5, 24, 'Titan de la Mineria', 'Recolecta 1,000,000 de metal para activar +5% velocidad de produccion durante 24h.', 'Pickaxe', true, 0)
ON CONFLICT (code) DO NOTHING
RETURNING id
" 2>&1

echo ""
echo "=== Try build_12 ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('build_12', 'build', 12, 'construction_speed_bonus', 5, 24, 'Arquitecto Supremo', 'Construye 12 niveles de edificios para activar +5% velocidad de construccion durante 24h.', 'Building', true, 0)
ON CONFLICT (code) DO NOTHING
RETURNING id
" 2>&1

echo ""
echo "=== Try research_8 ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('research_8', 'research', 8, 'research_speed_bonus', 5, 24, 'Mente Maestra', 'Investiga 8 niveles de tecnologias para activar +5% velocidad de investigacion durante 24h.', 'FlaskConical', true, 0)
ON CONFLICT (code) DO NOTHING
RETURNING id
" 2>&1

echo ""
echo "=== Try attack_15 ==="
docker exec xnova-database psql -U postgres -d postgres -c "
INSERT INTO public.daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon, is_active, cost_fxu)
VALUES ('attack_15', 'attack', 15, 'fleet_speed_bonus', 5, 24, 'Senor de la Guerra', 'Ataca 15 flotas enemigas para activar +5% velocidad de vuelo durante 24h.', 'Swords', true, 0)
ON CONFLICT (code) DO NOTHING
RETURNING id
" 2>&1

echo ""
echo "=== Verify ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id, code, mission_type, target_count, reward_type, title_es, is_active FROM public.daily_missions WHERE code IN ('collect_metal_1m', 'build_12', 'research_8', 'attack_15') ORDER BY id" 2>&1
