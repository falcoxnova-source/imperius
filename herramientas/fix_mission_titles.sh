#!/bin/sh
echo "=== Find corrupted titles ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, title_es 
FROM public.daily_missions 
WHERE title_es LIKE '%?%' OR title_es LIKE '%Ã%'
ORDER BY id
" 2>&1

echo ""
echo "=== Fix all corrupted titles ==="
docker exec xnova-database psql -U postgres -d postgres << 'SQLEOF'
-- Fix mission 1
UPDATE public.daily_missions SET title_es = 'Recolector Incansable', desc_es = 'Recolecta 500k de cada recurso y obten +5% produccion por 24h' WHERE id = 1;

-- Fix mission 2
UPDATE public.daily_missions SET title_es = 'Flota Imparable', desc_es = 'Destruye 5 flotas enemigas y obten +4% velocidad de vuelo por 12h' WHERE id = 2;

-- Fix mission 7
UPDATE public.daily_missions SET title_es = 'Arquitecto Galactico', desc_es = 'Construye 3 niveles de edificios y obten +3% velocidad de construccion por 24h' WHERE id = 7;

-- Fix mission 9
UPDATE public.daily_missions SET title_es = 'Cientifico Estelar', desc_es = 'Investiga 2 tecnologias y obten +4% velocidad de investigacion por 24h' WHERE id = 9;

-- Fix premium missions
UPDATE public.daily_missions SET title_es = 'Senor de la Guerra', desc_es = 'Destruye 10 flotas enemigas y obten +6% produccion por 72h' WHERE id = 13;
UPDATE public.daily_missions SET title_es = 'Flota Acelerada', desc_es = 'Realiza 8 expediciones y obten +7% velocidad por 36h' WHERE id = 14;
UPDATE public.daily_missions SET title_es = 'Megaconstructor', desc_es = 'Construye 10 niveles de edificios y obten +10% produccion por 48h' WHERE id = 15;
UPDATE public.daily_missions SET title_es = 'Genio Cientifico', desc_es = 'Investiga 5 tecnologias y obten +9% velocidad por 24h' WHERE id = 16;
UPDATE public.daily_missions SET title_es = 'Magnate Industrial', desc_es = 'Recolecta 5M de metal y obten +5% velocidad por 48h' WHERE id = 17;
SQLEOF

echo ""
echo "=== Verify all titles clean ==="
docker exec xnova-database psql -U postgres -d postgres -c "
SELECT id, code, title_es, reward_type, reward_value, target_count
FROM public.daily_missions 
WHERE is_active = true
ORDER BY id
" 2>&1
