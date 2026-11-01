-- =====================================================================
-- POST-FIX VALIDATION: Verificar que se corrigió el problema
-- =====================================================================
--
-- Este script debe ejecutarse DESPUÉS de aplicar la migración
-- 20260503120000_fix_terraformer_exponential_formula.sql
--
-- =====================================================================

-- 1. Verificar que terraformer_field_bonus existe y es correcta
DO $$
DECLARE
  v_result integer;
BEGIN
  SELECT public.terraformer_field_bonus(20) INTO v_result;
  ASSERT v_result = 1259, 'ERROR: terraformer_field_bonus(20) should return 1259, got ' || v_result;
  
  SELECT public.terraformer_field_bonus(1) INTO v_result;
  ASSERT v_result = 5, 'ERROR: terraformer_field_bonus(1) should return 5, got ' || v_result;
  
  SELECT public.terraformer_field_bonus(0) INTO v_result;
  ASSERT v_result = 0, 'ERROR: terraformer_field_bonus(0) should return 0, got ' || v_result;
  
  RAISE NOTICE 'PASS: terraformer_field_bonus is correct';
END $$;

-- 2. Verificar que NO hay planetas con fields_used > fields_max
DO $$
DECLARE
  v_count integer;
  v_worst_overflow integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.planets
  WHERE user_id IS NOT NULL
    AND planet_type = 'planet'
    AND fields_used > fields_max;
  
  IF v_count > 0 THEN
    SELECT MAX(fields_used - fields_max) INTO v_worst_overflow
    FROM public.planets
    WHERE user_id IS NOT NULL
      AND planet_type = 'planet'
      AND fields_used > fields_max;
    
    RAISE WARNING 'FAIL: Still % planets with overflow. Worst: %', v_count, v_worst_overflow;
  ELSE
    RAISE NOTICE 'PASS: No planets with fields_used > fields_max';
  END IF;
END $$;

-- 3. Listar los TOP 5 planetas que fueron corregidos (tuvieron que aumentar fields_max)
SELECT 
  pr.username,
  p.name,
  p.position,
  p.diameter,
  p.fields_used,
  p.fields_max,
  pb.level as terraformer_level,
  public.terraformer_field_bonus(pb.level) as terra_bonus
FROM public.planets p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
LEFT JOIN public.planet_buildings pb ON p.id = pb.planet_id 
  AND pb.building_type_id = (SELECT id FROM public.building_types WHERE code = 'terraformer')
WHERE p.user_id IS NOT NULL
  AND p.planet_type = 'planet'
  AND pb.level > 0
ORDER BY pb.level DESC, p.diameter DESC
LIMIT 5;

-- 4. Verificar la fórmula en algunos casos específicos
WITH test_cases AS (
  SELECT 
    p.id,
    pr.username,
    p.name,
    p.diameter,
    p.position,
    p.fields_used,
    p.fields_max,
    pb.level as terra_level,
    FLOOR(POWER(p.diameter / 1000.0, 2))::integer as base_fields,
    CASE p.position
      WHEN 1 THEN -30
      WHEN 2 THEN -20
      WHEN 3 THEN -10
      WHEN 10 THEN 5
      WHEN 11 THEN 10
      WHEN 12 THEN 15
      WHEN 13 THEN 20
      WHEN 14 THEN 15
      WHEN 15 THEN 10
      ELSE 0
    END as pos_bonus,
    public.terraformer_field_bonus(COALESCE(pb.level, 0)) as terra_bonus
  FROM public.planets p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  LEFT JOIN public.planet_buildings pb ON p.id = pb.planet_id 
    AND pb.building_type_id = (SELECT id FROM public.building_types WHERE code = 'terraformer')
  WHERE p.user_id IS NOT NULL
    AND p.planet_type = 'planet'
    AND pr.username ILIKE 'diablo%'
  LIMIT 5
)
SELECT 
  username,
  name,
  position,
  diameter,
  fields_used || '/' || fields_max as fields,
  terra_level,
  'Expected=' || GREATEST(40, base_fields + COALESCE(pos_bonus, 0) + COALESCE(terra_bonus, 0)) as expected_max
FROM test_cases;

-- 5. Resumen general
SELECT
  'Planets with terraformer' as metric,
  COUNT(*) as count
FROM public.planets p
JOIN public.planet_buildings pb ON p.id = pb.planet_id
JOIN public.building_types bt ON pb.building_type_id = bt.id
WHERE p.user_id IS NOT NULL
  AND p.planet_type = 'planet'
  AND bt.code = 'terraformer'
  AND pb.level > 0

UNION ALL

SELECT
  'Planets where fields_used = fields_max (no free)',
  COUNT(*)
FROM public.planets
WHERE user_id IS NOT NULL
  AND planet_type = 'planet'
  AND fields_used = fields_max

UNION ALL

SELECT
  'Planets with overflow (SHOULD BE 0)',
  COUNT(*)
FROM public.planets
WHERE user_id IS NOT NULL
  AND planet_type = 'planet'
  AND fields_used > fields_max;
