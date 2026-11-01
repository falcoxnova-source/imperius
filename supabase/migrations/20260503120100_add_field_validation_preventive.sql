-- =====================================================================
-- ENHANCEMENT: Agregar validaciones preventivas para evitar futuros bugs
-- de campos en terraformer
-- =====================================================================
-- Este archivo es OPCIONAL - mejora robustez pero no es crítico

-- 1. Constraint CHECK en planets para asegurar fields_used <= fields_max
-- (solo si no existe ya)
ALTER TABLE public.planets
ADD CONSTRAINT check_fields_used_within_max 
  CHECK (fields_used <= fields_max) NOT VALID;

-- Validar que los datos existentes cumplan la constraint
DO $$
BEGIN
  ALTER TABLE public.planets VALIDATE CONSTRAINT check_fields_used_within_max;
EXCEPTION WHEN OTHERS THEN
  -- Si hay violaciones, la siguiente migración las corregirá
  RAISE WARNING 'Some planets violate fields_used <= fields_max constraint. Will be fixed by next migration.';
END $$;


-- 2. Trigger para validar que fields_max nunca sea menor a fields_used
CREATE OR REPLACE FUNCTION public.validate_fields_on_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
BEGIN
  IF NEW.fields_max < NEW.fields_used THEN
    -- Auto-corrección: aumentar fields_max si es necesario
    NEW.fields_max := NEW.fields_used;
    RAISE WARNING 'Auto-fixed fields_max for planet % (user %): now = %', 
      NEW.id, NEW.user_id, NEW.fields_max;
  END IF;
  
  IF NEW.fields_used < 0 THEN
    RAISE EXCEPTION 'Planet % cannot have negative fields_used', NEW.id;
  END IF;
  
  IF NEW.fields_max < 40 THEN
    NEW.fields_max := 40;  -- Mínimo de campos
    RAISE WARNING 'Auto-fixed fields_max for planet % to minimum (40)', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_validate_fields_on_update ON public.planets;
CREATE TRIGGER trigger_validate_fields_on_update
  BEFORE INSERT OR UPDATE ON public.planets
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_fields_on_update();

-- 3. Función para diagnosticar problemas de campos
CREATE OR REPLACE FUNCTION public.diagnose_planet_fields(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  v_planet record;
  v_calculated_max integer;
  v_terraformer_level integer;
  v_result jsonb;
BEGIN
  SELECT * INTO v_planet FROM public.planets WHERE id = p_planet_id;
  
  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;
  
  v_calculated_max := public.calculate_planet_max_fields(p_planet_id);
  
  SELECT COALESCE(pb.level, 0) INTO v_terraformer_level
  FROM public.planet_buildings pb
  JOIN public.building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';
  
  v_result := jsonb_build_object(
    'planet_id', v_planet.id,
    'planet_name', v_planet.name,
    'diameter', v_planet.diameter,
    'position', v_planet.position,
    'fields_used', v_planet.fields_used,
    'fields_max_current', v_planet.fields_max,
    'fields_max_calculated', v_calculated_max,
    'terraformer_level', v_terraformer_level,
    'terraformer_bonus', public.terraformer_field_bonus(v_terraformer_level),
    'status', CASE 
      WHEN v_planet.fields_used > v_planet.fields_max THEN 'OVERFLOW ⚠️'
      WHEN v_planet.fields_used = v_planet.fields_max THEN 'FULL (no free fields) ⚠️'
      WHEN v_planet.fields_max < v_calculated_max THEN 'UNDERESTIMATED (fields_max too low) ⚠️'
      WHEN v_planet.fields_max > v_calculated_max THEN 'OVERESTIMATED (fields_max too high) ⚠️'
      ELSE 'OK ✓'
    END,
    'free_fields', v_planet.fields_max - v_planet.fields_used,
    'needs_recalc', v_planet.fields_max != v_calculated_max
  );
  
  RETURN v_result;
END;
$function$;

-- 4. Function para listar todos los planetas con problemas
CREATE OR REPLACE FUNCTION public.list_field_problems()
RETURNS TABLE (
  username text,
  planet_name text,
  planet_position integer,
  fields_used integer,
  fields_max integer,
  expected_max integer,
  problem text
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    pr.username,
    p.name,
    p.position,
    p.fields_used,
    p.fields_max,
    public.calculate_planet_max_fields(p.id),
    CASE 
      WHEN p.fields_used > p.fields_max THEN 'OVERFLOW'::text
      WHEN p.fields_max < public.calculate_planet_max_fields(p.id) THEN 'UNDERESTIMATED'::text
      WHEN p.fields_max > public.calculate_planet_max_fields(p.id) THEN 'OVERESTIMATED'::text
      ELSE NULL::text
    END as problem
  FROM public.planets p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.user_id IS NOT NULL
    AND p.planet_type = 'planet'
    AND (
      p.fields_used > p.fields_max
      OR p.fields_max != public.calculate_planet_max_fields(p.id)
    )
  ORDER BY 
    CASE 
      WHEN p.fields_used > p.fields_max THEN 1
      ELSE 2
    END,
    (p.fields_used - p.fields_max) DESC,
    p.diameter DESC;
END;
$function$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.diagnose_planet_fields(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_field_problems() TO authenticated;
