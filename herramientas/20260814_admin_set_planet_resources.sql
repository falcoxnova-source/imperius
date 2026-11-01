-- 2026-08-14: Admin - ver y fijar los recursos (metal, cristal, deuterio) de un planeta.
--
-- Sigue exactamente el mismo patron que las funciones ya existentes
-- admin_set_planet_ship / admin_set_planet_building / admin_set_planet_defense:
--   SECURITY DEFINER, owner postgres, search_path public, solo admin.
--
-- Notas de seguridad / logica de negocio:
--  * Los recursos viven en public.planet_resources (metal, crystal, deuterium numeric).
--  * La tabla tiene el trigger protect_game_table_full que bloquea UPDATEs directos
--    desde 'authenticated'/'anon'. Al ser SECURITY DEFINER con owner postgres,
--    current_user = postgres y el trigger deja pasar (mismo bypass que usan las
--    demas RPC del juego). No se toca ese trigger.
--  * Antes de fijar se llama a sync_planet_resources() para consolidar la produccion
--    pendiente; asi el numero que fija el admin es el definitivo y no se le suma
--    despues una avalancha de produccion atrasada. Va dentro de un bloque EXCEPTION
--    para que un fallo del sync nunca tumbe la operacion del admin.
--  * El UPDATE final NO toca last_update, por lo que el trigger
--    trg_resource_collect_daily_mission (WHEN new.last_update > old.last_update)
--    NO se dispara: los recursos regalados por admin NO cuentan como
--    "recolectados" para las misiones diarias. Esto es intencional.
--  * Los checks de la tabla exigen >= 0; la funcion valida lo mismo antes.

BEGIN;

-- ---------------------------------------------------------------------------
-- Lectura: recursos actuales de un planeta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_planet_resources(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_res      RECORD;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM planets WHERE id = p_planet_id) THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  -- Consolidar la produccion pendiente para mostrar el valor real.
  BEGIN
    PERFORM sync_planet_resources(p_planet_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT metal, crystal, deuterium,
         metal_storage, crystal_storage, deuterium_storage
    INTO v_res
  FROM planet_resources
  WHERE planet_id = p_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'planet_id', p_planet_id,
      'has_row', false,
      'metal', 0, 'crystal', 0, 'deuterium', 0,
      'metal_storage', 0, 'crystal_storage', 0, 'deuterium_storage', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'planet_id', p_planet_id,
    'has_row', true,
    'metal',     FLOOR(COALESCE(v_res.metal, 0)),
    'crystal',   FLOOR(COALESCE(v_res.crystal, 0)),
    'deuterium', FLOOR(COALESCE(v_res.deuterium, 0)),
    'metal_storage',     COALESCE(v_res.metal_storage, 0),
    'crystal_storage',   COALESCE(v_res.crystal_storage, 0),
    'deuterium_storage', COALESCE(v_res.deuterium_storage, 0)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Escritura: fijar los recursos de un planeta
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_planet_resources(
  p_planet_id  uuid,
  p_metal      numeric,
  p_crystal    numeric,
  p_deuterium  numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin    boolean;
  v_planet_name text;
  v_old         RECORD;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;

  IF p_metal IS NULL OR p_crystal IS NULL OR p_deuterium IS NULL THEN
    RAISE EXCEPTION 'Resources cannot be null';
  END IF;

  IF p_metal < 0 OR p_crystal < 0 OR p_deuterium < 0 THEN
    RAISE EXCEPTION 'Resources must be >= 0';
  END IF;

  SELECT name INTO v_planet_name FROM planets WHERE id = p_planet_id;
  IF v_planet_name IS NULL THEN
    RAISE EXCEPTION 'Planet not found';
  END IF;

  -- Consolidar produccion pendiente ANTES de fijar (sube last_update y dispara
  -- el trigger de misiones diarias solo con la produccion legitima).
  BEGIN
    PERFORM sync_planet_resources(p_planet_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  SELECT metal, crystal, deuterium INTO v_old
  FROM planet_resources
  WHERE planet_id = p_planet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO planet_resources (planet_id, metal, crystal, deuterium)
    VALUES (p_planet_id, FLOOR(p_metal), FLOOR(p_crystal), FLOOR(p_deuterium));

    RETURN jsonb_build_object(
      'success', true,
      'planet_id', p_planet_id,
      'planet_name', v_planet_name,
      'old_metal', 0, 'old_crystal', 0, 'old_deuterium', 0,
      'new_metal', FLOOR(p_metal), 'new_crystal', FLOOR(p_crystal), 'new_deuterium', FLOOR(p_deuterium)
    );
  END IF;

  -- OJO: no se toca last_update a proposito -> el regalo del admin no cuenta
  -- como recurso "recolectado" para las misiones diarias.
  UPDATE planet_resources
  SET metal     = FLOOR(p_metal),
      crystal   = FLOOR(p_crystal),
      deuterium = FLOOR(p_deuterium)
  WHERE planet_id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_id', p_planet_id,
    'planet_name', v_planet_name,
    'old_metal',     FLOOR(COALESCE(v_old.metal, 0)),
    'old_crystal',   FLOOR(COALESCE(v_old.crystal, 0)),
    'old_deuterium', FLOOR(COALESCE(v_old.deuterium, 0)),
    'new_metal',     FLOOR(p_metal),
    'new_crystal',   FLOOR(p_crystal),
    'new_deuterium', FLOOR(p_deuterium)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_planet_resources(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_planet_resources(uuid, numeric, numeric, numeric) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
