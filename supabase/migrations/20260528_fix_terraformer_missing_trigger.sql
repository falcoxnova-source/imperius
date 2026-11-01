-- =====================================================================
-- FIX: Terraformer no otorga fields_max al subir de nivel
--
-- Causa raíz:
-- El trigger trigger_update_fields_on_terraformer fue creado en
-- migration 016 pero desapareció. La función 
-- update_planet_fields_on_terraformer() existe pero NO hay trigger
-- que la ejecute al cambiar planet_buildings.level.
--
-- Efectos:
-- - Cron (optimized_global_queue_processor) completa terraformer pero
--   solo suma fields_used+1, sin actualizar fields_max.
-- - secure_demolish_building confía en el trigger inexistente.
-- - Usuarios suben nivel de terraformer y no reciben los campos extra.
--
-- Fix:
-- 1. Crear el trigger faltante
-- 2. Recalcular fields_max para planetas con terraformer
-- =====================================================================

-- Step 1: Crear el trigger
DROP TRIGGER IF EXISTS trigger_update_fields_on_terraformer ON planet_buildings;
CREATE TRIGGER trigger_update_fields_on_terraformer
  AFTER INSERT OR UPDATE OF level ON planet_buildings
  FOR EACH ROW
  EXECUTE FUNCTION update_planet_fields_on_terraformer();

-- Step 2: Recalcular fields_max para planetas cuyo terraformer
--         haya quedado sin actualizar fields_max
WITH planets_to_fix AS (
  SELECT p.id, p.fields_max AS old_max,
         public.calculate_planet_max_fields(p.id) AS expected_max
  FROM planets p
  WHERE p.planet_type = 'planet'
    AND p.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = p.id AND bt.code = 'terraformer' AND pb.level > 0
    )
    AND p.fields_max != GREATEST(40, public.calculate_planet_max_fields(p.id))
)
UPDATE planets p
SET fields_max = GREATEST(40, ptf.expected_max)
FROM planets_to_fix ptf
WHERE p.id = ptf.id;

-- Step 3: Verificar
DO $$
DECLARE
  v_fixed integer;
  v_still_bad integer;
BEGIN
  SELECT COUNT(*) INTO v_fixed
  FROM planets p
  WHERE p.planet_type = 'planet'
    AND p.user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM planet_buildings pb
      JOIN building_types bt ON bt.id = pb.building_type_id
      WHERE pb.planet_id = p.id AND bt.code = 'terraformer' AND pb.level > 0
    )
    AND p.fields_max < public.calculate_planet_max_fields(p.id);

  SELECT COUNT(*) INTO v_still_bad
  FROM planets p
  WHERE p.planet_type = 'planet'
    AND p.user_id IS NOT NULL
    AND p.fields_max < p.fields_used;

  RAISE NOTICE 'Trigger creado. Planetas con terraformer corregidos: %', v_fixed;
  RAISE NOTICE 'Planetas con fields_used > fields_max (debe ser 0): %', v_still_bad;
END;
$$;
