-- ============================================================================
-- FIX: Corregir bloqueo de ataque - solo bloquear si UNICAMENTE hay sondas
-- El fix anterior bloqueaba todo. Este usa v_probe_type_id (ya existe en la fn)
-- para verificar que haya al menos 1 nave que NO sea sonda de espionaje.
-- ============================================================================

DO $$
DECLARE
  v_full_src text;
  v_new_src text;
  v_old_block text;
  v_new_block text;
  v_create_stmt text;
BEGIN
  SELECT prosrc INTO v_full_src FROM pg_proc 
  WHERE proname = 'secure_send_fleet'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ORDER BY oid DESC LIMIT 1;

  IF v_full_src IS NULL THEN
    RAISE EXCEPTION 'secure_send_fleet not found';
  END IF;

  -- Remover el bloque viejo (que tiene el JOIN problemático)
  v_old_block := '
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

  -- Nuevo bloque: usar v_probe_type_id que ya existe en la función
  v_new_block := '
  -- Block attack with only espionage probes
  IF p_mission_type = ''attack'' THEN
    PERFORM 1 FROM jsonb_to_recordset(p_fleet_ships) AS x(ship_type_id int, quantity int)
    WHERE x.quantity > 0 AND x.ship_type_id != v_probe_type_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(''success'', false, ''error'', ''No puedes atacar solo con sondas de espionaje'');
    END IF;
  END IF;

  ';

  v_new_src := replace(v_full_src, v_old_block, v_new_block);

  IF v_new_src = v_full_src THEN
    RAISE EXCEPTION 'Could not find old block to replace';
  END IF;

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
  
  RAISE NOTICE 'Fixed: attack now only blocks fleets with ONLY espionage probes';
END $$;
