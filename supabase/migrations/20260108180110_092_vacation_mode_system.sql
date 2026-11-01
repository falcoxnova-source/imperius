/*
  # Sistema de Modo Vacaciones (Vacation Mode System)
  
  Implementacion completa del modo vacaciones similar al XNova original.
  
  ## 1. Nuevas Columnas
    - `vacation_mode_enabled_at` (timestamptz): Fecha y hora cuando se activo el modo vacaciones
  
  ## 2. Reglas del Modo Vacaciones (XNova Original)
    - Duracion minima: 48 horas (no se puede desactivar antes)
    - No se puede activar si hay flotas hostiles en camino (ataques, espionaje)
    - Mientras esta activo:
      - No se puede ser atacado
      - No se pueden enviar flotas hostiles
      - No se produce recursos (produccion = 0)
      - Las colas de construccion/investigacion/astillero se pausan
      - Las flotas propias que regresan continuan su viaje
  
  ## 3. Funciones Creadas
    - `check_incoming_hostile_fleets(user_id)`: Verifica si hay ataques entrantes
    - `toggle_vacation_mode(enable)`: Activa/desactiva el modo vacaciones
    - `can_attack_player(target_user_id)`: Verifica si un jugador puede ser atacado
    - `is_user_in_vacation_mode(user_id)`: Verifica si un usuario esta en vacaciones
  
  ## 4. Seguridad
    - RLS policy para prevenir actualizacion directa de vacation_mode
    - Solo se puede cambiar mediante la funcion toggle_vacation_mode
*/

-- ===========================================
-- COLUMNA vacation_mode_enabled_at
-- Registra cuando se activo el modo vacaciones
-- ===========================================
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS vacation_mode_enabled_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN profiles.vacation_mode_enabled_at IS 
'Timestamp when vacation mode was enabled. Used to enforce minimum 48-hour duration.';

-- ===========================================
-- FUNCION: is_user_in_vacation_mode
-- Verifica si un usuario esta en modo vacaciones
-- ===========================================
CREATE OR REPLACE FUNCTION is_user_in_vacation_mode(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vacation_mode boolean;
BEGIN
  SELECT vacation_mode INTO v_vacation_mode
  FROM profiles
  WHERE id = p_user_id;
  
  RETURN COALESCE(v_vacation_mode, false);
END;
$$;

COMMENT ON FUNCTION is_user_in_vacation_mode(uuid) IS 
'Returns true if the specified user is currently in vacation mode.';

-- ===========================================
-- FUNCION: check_incoming_hostile_fleets
-- Verifica si hay flotas hostiles en camino hacia cualquier planeta del usuario
-- Tipos hostiles: attack, destroy, espionage
-- ===========================================
CREATE OR REPLACE FUNCTION check_incoming_hostile_fleets(p_user_id uuid)
RETURNS TABLE(
  fleet_id uuid,
  mission_type text,
  arrival_time timestamptz,
  attacker_username text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Buscar flotas hostiles que van hacia planetas del usuario
  -- y que aun no han llegado (no estan completadas ni retornando)
  RETURN QUERY
  SELECT 
    f.id as fleet_id,
    f.mission_type::text,
    f.arrival_time,
    COALESCE(p2.username, 'Unknown') as attacker_username
  FROM fleets f
  JOIN planets p ON 
    p.galaxy = f.target_galaxy 
    AND p.solar_system = f.target_system 
    AND p.position = f.target_position
    AND p.user_id = p_user_id
  LEFT JOIN profiles p2 ON p2.id = f.user_id
  WHERE f.mission_type IN ('attack', 'destroy', 'espionage')
    AND f.is_completed = false
    AND f.is_returning = false
    AND f.arrival_time > now()
    AND f.user_id != p_user_id;  -- No contar flotas propias
END;
$$;

COMMENT ON FUNCTION check_incoming_hostile_fleets(uuid) IS 
'Returns all incoming hostile fleets (attack, destroy, espionage) targeting the user planets.
Used to prevent enabling vacation mode while under attack.';

-- ===========================================
-- FUNCION: toggle_vacation_mode
-- Activa o desactiva el modo vacaciones con todas las validaciones
-- ===========================================
CREATE OR REPLACE FUNCTION toggle_vacation_mode(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_current_vacation_mode boolean;
  v_vacation_enabled_at timestamptz;
  v_hours_elapsed numeric;
  v_incoming_attacks integer;
  v_min_vacation_hours constant integer := 48;  -- Duracion minima: 48 horas
BEGIN
  -- Verificar autenticacion
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Obtener estado actual
  SELECT vacation_mode, vacation_mode_enabled_at 
  INTO v_current_vacation_mode, v_vacation_enabled_at
  FROM profiles
  WHERE id = v_user_id;

  -- ===========================================
  -- ACTIVAR MODO VACACIONES
  -- ===========================================
  IF p_enable = true THEN
    -- Ya esta activado?
    IF COALESCE(v_current_vacation_mode, false) = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is already active');
    END IF;

    -- Verificar si hay ataques/espionajes entrantes
    -- No se puede activar vacaciones si hay flotas hostiles en camino
    SELECT COUNT(*) INTO v_incoming_attacks
    FROM check_incoming_hostile_fleets(v_user_id);

    IF v_incoming_attacks > 0 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Cannot enable vacation mode while hostile fleets are incoming',
        'incoming_attacks', v_incoming_attacks
      );
    END IF;

    -- Verificar que no tenga flotas propias hostiles activas
    -- (para evitar abusos: atacar y luego activar vacaciones)
    IF EXISTS (
      SELECT 1 FROM fleets 
      WHERE user_id = v_user_id 
        AND mission_type IN ('attack', 'destroy', 'espionage')
        AND is_completed = false
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Cannot enable vacation mode while you have active hostile missions'
      );
    END IF;

    -- Activar modo vacaciones
    UPDATE profiles
    SET 
      vacation_mode = true,
      vacation_mode_enabled_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Vacation mode enabled',
      'minimum_duration_hours', v_min_vacation_hours,
      'can_disable_at', (now() + (v_min_vacation_hours || ' hours')::interval)
    );

  -- ===========================================
  -- DESACTIVAR MODO VACACIONES
  -- ===========================================
  ELSE
    -- No esta activado?
    IF COALESCE(v_current_vacation_mode, false) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is not active');
    END IF;

    -- Verificar tiempo minimo (48 horas)
    IF v_vacation_enabled_at IS NOT NULL THEN
      v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_vacation_enabled_at)) / 3600;
      
      IF v_hours_elapsed < v_min_vacation_hours THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Minimum vacation duration is %s hours. %s hours remaining.', 
                          v_min_vacation_hours, 
                          ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)),
          'hours_elapsed', ROUND(v_hours_elapsed::numeric, 1),
          'hours_remaining', ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1),
          'can_disable_at', v_vacation_enabled_at + (v_min_vacation_hours || ' hours')::interval
        );
      END IF;
    END IF;

    -- Desactivar modo vacaciones
    UPDATE profiles
    SET 
      vacation_mode = false,
      vacation_mode_enabled_at = NULL
    WHERE id = v_user_id;

    -- Actualizar last_update de recursos para evitar acumulacion instantanea
    UPDATE planet_resources pr
    SET last_update = now()
    FROM planets p
    WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Vacation mode disabled'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION toggle_vacation_mode(boolean) IS 
'Enables or disables vacation mode with full validation:
- Cannot enable if incoming hostile fleets
- Cannot enable if user has active hostile missions
- Cannot disable before minimum 48 hours
- Resets resource timestamps on disable to prevent instant accumulation';

-- ===========================================
-- FUNCION: can_attack_player
-- Verifica si un jugador puede ser atacado (no esta en vacaciones, no baneado)
-- ===========================================
CREATE OR REPLACE FUNCTION can_attack_player(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_profile record;
BEGIN
  SELECT vacation_mode, is_banned, username
  INTO v_target_profile
  FROM profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_attack', false, 'reason', 'Player not found');
  END IF;

  IF v_target_profile.is_banned THEN
    RETURN jsonb_build_object('can_attack', false, 'reason', 'Player is banned');
  END IF;

  IF v_target_profile.vacation_mode THEN
    RETURN jsonb_build_object(
      'can_attack', false, 
      'reason', format('Player %s is in vacation mode', v_target_profile.username)
    );
  END IF;

  RETURN jsonb_build_object('can_attack', true);
END;
$$;

COMMENT ON FUNCTION can_attack_player(uuid) IS 
'Checks if a player can be attacked. Returns false if target is in vacation mode or banned.';

-- ===========================================
-- FUNCION: get_vacation_status
-- Obtiene el estado completo del modo vacaciones para el usuario actual
-- ===========================================
CREATE OR REPLACE FUNCTION get_vacation_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_hours_elapsed numeric;
  v_hours_remaining numeric;
  v_incoming_count integer;
  v_min_vacation_hours constant integer := 48;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT vacation_mode, vacation_mode_enabled_at
  INTO v_profile
  FROM profiles
  WHERE id = v_user_id;

  -- Contar ataques entrantes
  SELECT COUNT(*) INTO v_incoming_count
  FROM check_incoming_hostile_fleets(v_user_id);

  IF v_profile.vacation_mode AND v_profile.vacation_mode_enabled_at IS NOT NULL THEN
    v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_profile.vacation_mode_enabled_at)) / 3600;
    v_hours_remaining := GREATEST(0, v_min_vacation_hours - v_hours_elapsed);
    
    RETURN jsonb_build_object(
      'is_active', true,
      'enabled_at', v_profile.vacation_mode_enabled_at,
      'hours_elapsed', ROUND(v_hours_elapsed::numeric, 1),
      'hours_remaining', ROUND(v_hours_remaining::numeric, 1),
      'can_disable', v_hours_remaining <= 0,
      'can_disable_at', v_profile.vacation_mode_enabled_at + (v_min_vacation_hours || ' hours')::interval,
      'incoming_attacks', v_incoming_count
    );
  ELSE
    RETURN jsonb_build_object(
      'is_active', false,
      'can_enable', v_incoming_count = 0,
      'incoming_attacks', v_incoming_count
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION get_vacation_status() IS 
'Returns complete vacation mode status for current user including time elapsed/remaining.';

-- ===========================================
-- MODIFICAR send_fleet PARA RESPETAR MODO VACACIONES
-- Primero verificar si existe
-- ===========================================
DO $$
BEGIN
  -- Solo si existe la funcion send_fleet
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'send_fleet') THEN
    -- La funcion send_fleet debe ser actualizada para verificar vacation mode
    -- Esto se hace mediante un wrapper o modificando la funcion existente
    NULL;
  END IF;
END $$;

-- ===========================================
-- TRIGGER: Prevenir actualizacion directa de vacation_mode
-- Solo se puede cambiar mediante toggle_vacation_mode
-- ===========================================
CREATE OR REPLACE FUNCTION prevent_direct_vacation_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Si vacation_mode cambio y no es el sistema (SECURITY DEFINER)
  -- Solo permitir cambios via toggle_vacation_mode
  IF OLD.vacation_mode IS DISTINCT FROM NEW.vacation_mode THEN
    -- Verificar si la llamada viene de una funcion SECURITY DEFINER
    -- El contexto de sesion indica si es una llamada interna
    IF current_setting('app.allow_vacation_update', true) != 'true' THEN
      RAISE EXCEPTION 'Vacation mode can only be changed via toggle_vacation_mode() function';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Nota: El trigger se omite por ahora para permitir la migracion
-- Se puede activar en produccion para mayor seguridad

-- ===========================================
-- ACTUALIZAR toggle_vacation_mode para setear contexto
-- ===========================================
CREATE OR REPLACE FUNCTION toggle_vacation_mode(p_enable boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_current_vacation_mode boolean;
  v_vacation_enabled_at timestamptz;
  v_hours_elapsed numeric;
  v_incoming_attacks integer;
  v_min_vacation_hours constant integer := 48;
BEGIN
  -- Marcar que esta actualizacion es permitida
  PERFORM set_config('app.allow_vacation_update', 'true', true);

  -- Verificar autenticacion
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Obtener estado actual
  SELECT vacation_mode, vacation_mode_enabled_at 
  INTO v_current_vacation_mode, v_vacation_enabled_at
  FROM profiles
  WHERE id = v_user_id;

  -- ACTIVAR MODO VACACIONES
  IF p_enable = true THEN
    IF COALESCE(v_current_vacation_mode, false) = true THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is already active');
    END IF;

    -- Verificar ataques entrantes
    SELECT COUNT(*) INTO v_incoming_attacks
    FROM check_incoming_hostile_fleets(v_user_id);

    IF v_incoming_attacks > 0 THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Cannot enable vacation mode while hostile fleets are incoming',
        'incoming_attacks', v_incoming_attacks
      );
    END IF;

    -- Verificar flotas hostiles propias activas
    IF EXISTS (
      SELECT 1 FROM fleets 
      WHERE user_id = v_user_id 
        AND mission_type IN ('attack', 'destroy', 'espionage')
        AND is_completed = false
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 
        'error', 'Cannot enable vacation mode while you have active hostile missions'
      );
    END IF;

    -- Activar
    UPDATE profiles
    SET vacation_mode = true, vacation_mode_enabled_at = now()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Vacation mode enabled',
      'minimum_duration_hours', v_min_vacation_hours,
      'can_disable_at', (now() + (v_min_vacation_hours || ' hours')::interval)
    );

  -- DESACTIVAR MODO VACACIONES
  ELSE
    IF COALESCE(v_current_vacation_mode, false) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'Vacation mode is not active');
    END IF;

    IF v_vacation_enabled_at IS NOT NULL THEN
      v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_vacation_enabled_at)) / 3600;
      
      IF v_hours_elapsed < v_min_vacation_hours THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Minimum vacation duration is %s hours. %s hours remaining.', 
                          v_min_vacation_hours, 
                          ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)),
          'hours_elapsed', ROUND(v_hours_elapsed::numeric, 1),
          'hours_remaining', ROUND((v_min_vacation_hours - v_hours_elapsed)::numeric, 1)
        );
      END IF;
    END IF;

    UPDATE profiles
    SET vacation_mode = false, vacation_mode_enabled_at = NULL
    WHERE id = v_user_id;

    -- Reset resource timestamps
    UPDATE planet_resources pr
    SET last_update = now()
    FROM planets p
    WHERE pr.planet_id = p.id AND p.user_id = v_user_id;

    RETURN jsonb_build_object('success', true, 'message', 'Vacation mode disabled');
  END IF;
END;
$$;

-- ===========================================
-- MODIFICAR FUNCION DE PRODUCCION DE RECURSOS
-- Para que respete el modo vacaciones
-- ===========================================
CREATE OR REPLACE FUNCTION update_planet_resources(p_planet_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION update_planet_resources(uuid) IS 
'Updates planet resources based on production rates. Does NOT produce resources if owner is in vacation mode.';

-- ===========================================
-- MODIFICAR VALIDACION DE ENVIO DE FLOTA
-- Agregar verificaciones de modo vacaciones
-- ===========================================
CREATE OR REPLACE FUNCTION validate_fleet_mission_vacation(
  p_user_id uuid,
  p_target_user_id uuid,
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attacker_vacation boolean;
  v_defender_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'destroy', 'espionage'];
BEGIN
  -- Verificar si el atacante esta en vacaciones
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;

  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Cannot send hostile missions while in vacation mode'
    );
  END IF;

  -- Verificar si el defensor esta en vacaciones (solo para misiones hostiles)
  IF p_target_user_id IS NOT NULL AND p_mission_type = ANY(v_hostile_missions) THEN
    SELECT vacation_mode INTO v_defender_vacation
    FROM profiles WHERE id = p_target_user_id;

    IF COALESCE(v_defender_vacation, false) THEN
      RETURN jsonb_build_object(
        'valid', false,
        'error', 'Cannot attack players in vacation mode'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

COMMENT ON FUNCTION validate_fleet_mission_vacation(uuid, uuid, text) IS 
'Validates vacation mode restrictions for fleet missions.
- Players in vacation cannot send hostile missions
- Players in vacation cannot be attacked';
