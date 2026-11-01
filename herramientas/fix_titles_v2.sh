#!/bin/sh
echo "=== Fix mission titles one by one ==="

docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Recolector Incansable', desc_es = 'Recolecta 500k de cada recurso. Obtain +5% produccion por 24h.' WHERE id = 1" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Flota Imparable', desc_es = 'Destruye 5 flotas enemigas. Obtain +4% velocidad de vuelo por 12h.' WHERE id = 2" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Arquitecto Galactico', desc_es = 'Construye 3 niveles de edificios. Obtain +3% velocidad de construccion por 24h.' WHERE id = 7" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Cientifico Estelar', desc_es = 'Investiga 2 tecnologias. Obtain +4% velocidad de investigacion por 24h.' WHERE id = 9" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Senor de la Guerra Premium', desc_es = 'Destruye 10 flotas enemigas. Obtain +6% produccion por 72h.' WHERE id = 13" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Flota Acelerada Premium', desc_es = 'Realiza 8 expediciones. Obtain +7% velocidad por 36h.' WHERE id = 14" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Megaconstructor Premium', desc_es = 'Construye 10 niveles de edificios. Obtain +10% produccion por 48h.' WHERE id = 15" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Genio Cientifico Premium', desc_es = 'Investiga 5 tecnologias. Obtain +9% velocidad por 24h.' WHERE id = 16" 2>&1
docker exec xnova-database psql -U postgres -d postgres -c "UPDATE public.daily_missions SET title_es = 'Magnate Industrial Premium', desc_es = 'Recolecta 5M de metal. Obtain +5% velocidad por 48h.' WHERE id = 17" 2>&1

echo ""
echo "=== Verify ==="
docker exec xnova-database psql -U postgres -d postgres -c "SELECT id, code, title_es FROM public.daily_missions WHERE id IN (1,2,7,9,13,14,15,16,17) ORDER BY id" 2>&1
