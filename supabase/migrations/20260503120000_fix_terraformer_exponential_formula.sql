-- =====================================================================
-- FIX: Terraformer fields calculation — fix exponential formula
--
-- Root cause of field loss:
-- 1. Migration 20260305140000 introduced exponential formula:
--    FLOOR(5 * POWER(level, 1.3)) 
--    instead of linear level * 5
--
-- 2. But after migration 20260502133000 (fix demolish double subtract),
--    there was confusion about when the trigger recalculates fields_max
--
-- 3. Some update operations may have used inconsistent formulas,
--    causing fields_used > fields_max in players' planets
--
-- Fix:
-- 1. Ensure terraformer_field_bonus exists and is correct
-- 2. Ensure calculate_planet_max_fields uses the exponential formula
-- 3. Ensure update_planet_fields_on_terraformer trigger is correct
-- 4. Recalculate all affected planets
-- =====================================================================

-- Step 1: Ensure terraformer_field_bonus helper exists and is correct
CREATE OR REPLACE FUNCTION public.terraformer_field_bonus(p_level integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $function$
BEGIN
  IF p_level <= 0 THEN
    RETURN 0;
  END IF;
  RETURN FLOOR(5 * POWER(p_level, 1.3))::integer;
END;
$function$;


-- Step 2: Ensure calculate_planet_max_fields uses exponential formula correctly
CREATE OR REPLACE FUNCTION public.calculate_planet_max_fields(p_planet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_planet record;
  v_terraformer_level integer;
  v_base_fields integer;
  v_position_bonus integer;
BEGIN
  SELECT * INTO v_planet FROM public.planets WHERE id = p_planet_id;

  IF v_planet IS NULL THEN
    RETURN 40;
  END IF;

  IF v_planet.planet_type = 'moon' THEN
    RETURN v_planet.fields_max;
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_terraformer_level
  FROM public.planet_buildings pb
  JOIN public.building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';

  IF v_terraformer_level IS NULL THEN
    v_terraformer_level := 0;
  END IF;

  v_base_fields := FLOOR(POWER(v_planet.diameter / 1000.0, 2))::integer;

  v_position_bonus := CASE v_planet.position
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
  END;

  -- Use exponential formula via terraformer_field_bonus helper
  RETURN GREATEST(40, v_base_fields + v_position_bonus + public.terraformer_field_bonus(v_terraformer_level));
END;
$function$;


-- Step 3: Ensure update_planet_fields_on_terraformer trigger is correct
CREATE OR REPLACE FUNCTION public.update_planet_fields_on_terraformer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_building_code text;
  v_new_max_fields integer;
BEGIN
  SELECT code INTO v_building_code
  FROM public.building_types WHERE id = NEW.building_type_id;

  IF v_building_code = 'terraformer' THEN
    v_new_max_fields := public.calculate_planet_max_fields(NEW.planet_id);

    UPDATE public.planets
    SET fields_max = v_new_max_fields
    WHERE id = NEW.planet_id;
  END IF;

  RETURN NEW;
END;
$function$;


-- Step 4: Recalculate fields_max for all planets that have issues
-- This ensures fields_used <= fields_max always
WITH planets_to_fix AS (
  SELECT 
    p.id,
    p.planet_type,
    p.fields_used,
    p.fields_max AS old_max,
    public.calculate_planet_max_fields(p.id) AS calculated_max,
    GREATEST(p.fields_used, public.calculate_planet_max_fields(p.id)) AS new_max
  FROM public.planets p
  WHERE p.user_id IS NOT NULL
    AND p.planet_type = 'planet'
)
UPDATE public.planets p
SET fields_max = ptf.new_max
FROM planets_to_fix ptf
WHERE p.id = ptf.id
  AND p.fields_max != ptf.new_max;

-- Log the fix
DO $$
DECLARE
  v_fixed_count integer;
BEGIN
  SELECT COUNT(*) INTO v_fixed_count
  FROM public.planets
  WHERE user_id IS NOT NULL 
    AND planet_type = 'planet'
    AND fields_used > fields_max;
  
  IF v_fixed_count > 0 THEN
    RAISE WARNING 'After fix: still % planets with fields_used > fields_max (should be 0)', v_fixed_count;
  ELSE
    RAISE NOTICE 'Fix complete: All planets now have fields_used <= fields_max';
  END IF;
END;
$$;
