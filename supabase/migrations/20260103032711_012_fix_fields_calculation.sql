/*
  # Correccion del Calculo de Campos Usados

  ## Problema
  El sistema estaba sumando un campo por cada mejora de edificio, cuando deberia ser:
  - Cada edificio ocupa 1 campo SIN IMPORTAR su nivel
  - Solo se suma 1 campo cuando un edificio se construye por primera vez (nivel 0 -> 1)

  ## Cambios
  1. Actualiza todos los planetas con el calculo correcto de campos usados
  2. Crea una funcion que recalcula campos automaticamente

  ## Logica XNova Original
  - fields_used = cantidad de edificios unicos con nivel >= 1
  - Terraformer aumenta fields_max (no implementado en esta migracion)
*/

-- Primero, actualizar todos los planetas con el conteo correcto
UPDATE planets p
SET fields_used = COALESCE(
  (
    SELECT COUNT(*)
    FROM planet_buildings pb
    WHERE pb.planet_id = p.id
    AND pb.level > 0
  ),
  0
);

-- Crear funcion para recalcular campos de un planeta
CREATE OR REPLACE FUNCTION recalculate_planet_fields(p_planet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_building_count integer;
  v_terraformer_bonus integer;
BEGIN
  -- Contar edificios con nivel > 0
  SELECT COUNT(*) INTO v_building_count
  FROM planet_buildings
  WHERE planet_id = p_planet_id AND level > 0;
  
  -- Obtener bonus del terraformer (cada nivel da 5 campos adicionales segun XNova)
  SELECT COALESCE(pb.level * 5, 0) INTO v_terraformer_bonus
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';
  
  -- Actualizar el planeta
  UPDATE planets
  SET fields_used = v_building_count
  WHERE id = p_planet_id;
END;
$$;

-- Crear funcion para sincronizar fields_used despues de cambios en edificios
CREATE OR REPLACE FUNCTION sync_planet_fields_on_building_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM recalculate_planet_fields(NEW.planet_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recalculate_planet_fields(OLD.planet_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS trigger_sync_planet_fields ON planet_buildings;

-- Crear trigger para mantener sincronizado
CREATE TRIGGER trigger_sync_planet_fields
AFTER INSERT OR UPDATE OR DELETE ON planet_buildings
FOR EACH ROW
EXECUTE FUNCTION sync_planet_fields_on_building_change();
