-- ============================================================================
-- FIX: Bloquear ataque con solo sondas de espionaje
-- Las sondas tienen weapon_power=0, no deben poder enviarse en misión 'attack'
-- Se agrega validación en secure_send_fleet: para misión 'attack' se requiere
-- al menos 1 nave con weapon_power > 0
-- ============================================================================

-- Obtener la función actual y agregar SOLO la validación de ataque con sondas
-- La validación se agrega después de las checks de colonize/recycle/espionage

DO $$
DECLARE
  v_src text;
  v_pos int;
  v_injection text;
BEGIN
  -- Verificar que la función existe
  SELECT prosrc INTO v_src FROM pg_proc 
  WHERE proname = 'secure_send_fleet'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC LIMIT 1;
  
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'secure_send_fleet not found';
  END IF;

  -- Verificar que no tenga ya el fix
  IF v_src LIKE '%attack requires at least one combat ship%' THEN
    RAISE NOTICE 'Fix already applied, skipping';
    RETURN;
  END IF;
END $$;

-- Recrear solo el bloque de validación añadiendo el check de ataque
-- Usamos un approach seguro: CREATE OR REPLACE con la misma función
-- pero inyectando la validación después del check de espionaje

CREATE OR REPLACE FUNCTION block_attack_with_only_probes()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This is a temporary helper, we'll drop it after
  RAISE NOTICE 'Helper created';
END;
$$;
DROP FUNCTION IF EXISTS block_attack_with_only_probes();

-- El approach más seguro: ejecutar directamente la adición de la validación
-- en secure_send_fleet recreando la función completa con el fix

-- Primero obtenemos los parámetros de la función
-- secure_send_fleet tiene estos parámetros (verificado en producción):
-- p_origin_planet_id uuid, p_target_galaxy int, p_target_system int, 
-- p_target_position int, p_mission_type text, p_fleet_ships jsonb,
-- p_speed_percent int, p_cargo_metal bigint, p_cargo_crystal bigint, 
-- p_cargo_deuterium bigint, p_target_type text

-- Approach: usar dynamic SQL para obtener la función, inyectar el fix, y recrearla
DO $$
DECLARE
  v_full_src text;
  v_new_src text;
  v_anchor text;
  v_injection text;
  v_create_stmt text;
BEGIN
  -- Obtener source actual
  SELECT prosrc INTO v_full_src FROM pg_proc 
  WHERE proname = 'secure_send_fleet'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC LIMIT 1;

  -- Ya tiene el fix?
  IF v_full_src LIKE '%attack requires at least one combat ship%' THEN
    RAISE NOTICE 'Fix already applied';
    RETURN;
  END IF;

  -- El anchor: justo después del bloque de espionage check
  -- Buscamos "v_total_cargo_used" que viene justo después de los checks de mission
  v_anchor := 'v_total_cargo_used := COALESCE(p_cargo_metal, 0)';
  
  -- La validación a inyectar
  v_injection := '
  -- Block attack with only espionage probes (weapon_power = 0)
  IF p_mission_type = ''attack'' THEN
    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    JOIN ship_types st ON st.id = x.ship_type_id
    WHERE x.quantity > 0 AND st.weapon_power > 0;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(''success'', false, ''error'', ''Attack requires at least one combat ship with weapons'');
    END IF;
  END IF;

  ';

  -- Inyectar antes del anchor
  v_new_src := replace(v_full_src, v_anchor, v_injection || v_anchor);

  -- Verificar que se inyectó
  IF v_new_src = v_full_src THEN
    RAISE EXCEPTION 'Could not find injection point in secure_send_fleet';
  END IF;

  -- Recrear la función
  v_create_stmt := '
CREATE OR REPLACE FUNCTION secure_send_fleet(
  p_origin_planet_id uuid,
  p_target_galaxy int,
  p_target_system int,
  p_target_position int,
  p_mission_type text,
  p_fleet_ships jsonb,
  p_speed_percent int DEFAULT 100,
  p_cargo_metal bigint DEFAULT 0,
  p_cargo_crystal bigint DEFAULT 0,
  p_cargo_deuterium bigint DEFAULT 0,
  p_target_type text DEFAULT ''planet''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$' || v_new_src || '$fn$;';

  EXECUTE v_create_stmt;
  
  RAISE NOTICE 'secure_send_fleet updated: attack now requires combat ships';
END $$;
