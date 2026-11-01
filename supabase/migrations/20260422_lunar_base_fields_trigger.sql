-- =============================================================================
-- Fix: Base Lunar no aumenta fields_max de forma fiable
-- Causa: múltiples rutas de completado (cron A/B, frontend, admin, batch) con
--        fórmulas distintas (absoluto vs incremental) y condiciones de carrera.
--        Cuando el upgrade se procesa "a medias" por dos rutas, la level sube
--        pero fields_max queda con el valor del nivel anterior.
-- Solución: trigger AFTER INSERT/UPDATE en planet_buildings que, si la fila es
--        la Base Lunar de una luna, garantiza fields_max >= 1 + level*3.
--        Con esto, sin importar qué ruta complete la cola, el bonus se aplica.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_lunar_base_fields_max()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lunar_base_id integer;
  v_planet_type text;
  v_expected_max integer;
BEGIN
  -- Solo actúa si esta fila corresponde a la Base Lunar.
  SELECT id INTO v_lunar_base_id FROM building_types WHERE code = 'lunar_base' LIMIT 1;
  IF v_lunar_base_id IS NULL OR NEW.building_type_id <> v_lunar_base_id THEN
    RETURN NEW;
  END IF;

  -- Solo en lunas.
  SELECT planet_type INTO v_planet_type FROM planets WHERE id = NEW.planet_id;
  IF v_planet_type IS DISTINCT FROM 'moon' THEN
    RETURN NEW;
  END IF;

  -- fields_max >= 1 + level*3. Nunca reduce (GREATEST).
  v_expected_max := 1 + COALESCE(NEW.level, 0) * 3;

  UPDATE planets
     SET fields_max = GREATEST(fields_max, v_expected_max)
   WHERE id = NEW.planet_id
     AND fields_max < v_expected_max;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_lunar_base_fields_max ON public.planet_buildings;

CREATE TRIGGER trigger_enforce_lunar_base_fields_max
AFTER INSERT OR UPDATE OF level
ON public.planet_buildings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_lunar_base_fields_max();

-- =============================================================================
-- Backfill inmediato de lunas con fields_max desincronizado.
-- Nunca reduce (GREATEST preserva los campos ya usados por si había un cap mayor).
-- =============================================================================
WITH moon_lb AS (
  SELECT p.id AS planet_id,
         COALESCE(pb.level, 0) AS lb_level,
         p.fields_max AS current_max,
         p.fields_used
    FROM planets p
    LEFT JOIN planet_buildings pb
      ON pb.planet_id = p.id
     AND pb.building_type_id = (SELECT id FROM building_types WHERE code = 'lunar_base')
   WHERE p.planet_type = 'moon'
     AND NOT p.is_destroyed
)
UPDATE planets p
   SET fields_max = GREATEST(ml.current_max, ml.fields_used, 1 + ml.lb_level * 3)
  FROM moon_lb ml
 WHERE p.id = ml.planet_id
   AND p.fields_max < GREATEST(ml.fields_used, 1 + ml.lb_level * 3);
