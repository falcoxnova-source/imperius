CREATE OR REPLACE FUNCTION public.update_planet_resources(p_planet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_planet record;
  v_resources record;
  v_seconds_elapsed numeric;
  v_vacation_mode boolean;
  v_metal_produced numeric;
  v_crystal_produced numeric;
  v_deuterium_produced numeric;
BEGIN
  -- Obtener informacion del planeta
  SELECT p.*, pr.vacation_mode INTO v_planet
  FROM planets p
  JOIN profiles pr ON pr.id = p.user_id
  WHERE p.id = p_planet_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Si el usuario esta en modo vacaciones, no producir recursos
  IF v_planet.vacation_mode = true THEN
    -- Solo actualizar timestamp, sin producir
    UPDATE planet_resources
    SET last_update = now()
    WHERE planet_id = p_planet_id;
    RETURN;
  END IF;

  -- Obtener recursos actuales
  SELECT * INTO v_resources
  FROM planet_resources
  WHERE planet_id = p_planet_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calcular tiempo transcurrido
  v_seconds_elapsed := EXTRACT(EPOCH FROM (now() - v_resources.last_update));
  
  -- [COLMKT5] colonia en venta: solo cuenta la produccion anterior a la publicacion
  IF public._colony_listed_since(p_planet_id) IS NOT NULL THEN
    v_seconds_elapsed := LEAST(v_seconds_elapsed, GREATEST(0, EXTRACT(EPOCH FROM (public._colony_listed_since(p_planet_id) - v_resources.last_update))));
  END IF;
  IF v_seconds_elapsed <= 0 THEN
    RETURN;
  END IF;

  -- Calcular produccion (por hora -> por segundo)
  v_metal_produced := (v_resources.metal_per_hour / 3600) * v_seconds_elapsed;
  v_crystal_produced := (v_resources.crystal_per_hour / 3600) * v_seconds_elapsed;
  v_deuterium_produced := (v_resources.deuterium_per_hour / 3600) * v_seconds_elapsed;

  -- Actualizar recursos respetando el almacenamiento maximo
  UPDATE planet_resources
  SET
    metal = LEAST(metal + v_metal_produced, metal_storage),
    crystal = LEAST(crystal + v_crystal_produced, crystal_storage),
    deuterium = LEAST(deuterium + v_deuterium_produced, deuterium_storage),
    last_update = now()
  WHERE planet_id = p_planet_id;
END;
$function$

