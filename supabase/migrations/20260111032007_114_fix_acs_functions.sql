/*
  # Fix ACS Functions - Correccion de funciones del Sistema de Combate de Alianza

  1. Problemas corregidos:
    - join_acs_attack: Usaba columnas incorrectas (mission vs mission_type, owner_id vs user_id)
    - join_acs_attack: Usaba acs_fleet_id en lugar de acs_id
    - create_acs_from_fleet: No establecía creator_id
    - get_available_acs_attacks: Campos de retorno no coincidian con el frontend

  2. Cambios:
    - Actualiza join_acs_attack para usar nombres de columna correctos
    - Actualiza create_acs_from_fleet para establecer creator_id
    - Actualiza get_available_acs_attacks para devolver campos con nombres correctos
*/

-- Drop existing functions to recreate them
DROP FUNCTION IF EXISTS join_acs_attack(uuid, uuid);
DROP FUNCTION IF EXISTS get_available_acs_attacks();

-- Recreate join_acs_attack with correct column names
CREATE OR REPLACE FUNCTION join_acs_attack(p_acs_id uuid, p_fleet uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acs_record RECORD;
  v_fleet_record RECORD;
  v_user_id uuid;
  v_user_alliance uuid;
  v_new_arrival timestamptz;
  v_participant_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no autenticado');
  END IF;

  SELECT af.*, af.alliance_id as acs_alliance_id
  INTO v_acs_record
  FROM acs_fleets af
  WHERE af.id = p_acs_id 
  AND af.is_active = true
  AND af.status = 'waiting'
  AND af.arrival_time > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ataque ACS no encontrado o ya no esta disponible');
  END IF;

  SELECT am.alliance_id INTO v_user_alliance 
  FROM alliance_members am 
  WHERE am.user_id = v_user_id;

  IF v_user_alliance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes pertenecer a una alianza');
  END IF;

  IF v_user_alliance != v_acs_record.acs_alliance_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo miembros de la misma alianza pueden unirse');
  END IF;

  SELECT f.* INTO v_fleet_record
  FROM fleets f
  WHERE f.id = p_fleet 
  AND f.user_id = v_user_id
  AND f.is_completed = false
  AND f.is_returning = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no te pertenece');
  END IF;

  IF v_fleet_record.target_galaxy != v_acs_record.target_galaxy OR
     v_fleet_record.target_system != v_acs_record.target_system OR
     v_fleet_record.target_position != v_acs_record.target_position THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota debe tener el mismo destino que el ataque ACS');
  END IF;

  IF v_fleet_record.mission_type != 'attack' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo flotas de ataque pueden unirse a ataques ACS');
  END IF;

  IF v_fleet_record.acs_id IS NOT NULL OR v_fleet_record.is_acs = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya pertenece a un ataque ACS');
  END IF;

  SELECT COUNT(*) INTO v_participant_count FROM acs_participants WHERE acs_id = p_acs_id;
  IF v_participant_count >= v_acs_record.max_fleets THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ataque ACS ya tiene el maximo de participantes');
  END IF;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (p_acs_id, p_fleet, v_user_id);

  UPDATE fleets 
  SET acs_id = p_acs_id, is_acs = true
  WHERE id = p_fleet;

  UPDATE acs_fleets 
  SET current_participants = current_participants + 1
  WHERE id = p_acs_id;

  IF v_fleet_record.arrival_time > v_acs_record.arrival_time THEN
    v_new_arrival := v_fleet_record.arrival_time;
    UPDATE acs_fleets SET arrival_time = v_new_arrival WHERE id = p_acs_id;
    UPDATE fleets f
    SET arrival_time = v_new_arrival
    FROM acs_participants ap
    WHERE ap.acs_id = p_acs_id AND ap.fleet_id = f.id;
  ELSE
    UPDATE fleets SET arrival_time = v_acs_record.arrival_time WHERE id = p_fleet;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Te has unido al ataque ACS exitosamente'
  );
END;
$$;

-- Recreate get_available_acs_attacks with correct field names for frontend
CREATE OR REPLACE FUNCTION get_available_acs_attacks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_alliance_id uuid;
  v_user_id uuid;
  v_acs_list jsonb;
BEGIN
  v_user_id := auth.uid();
  
  SELECT am.alliance_id INTO v_user_alliance_id
  FROM alliance_members am
  WHERE am.user_id = v_user_id;

  IF v_user_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No perteneces a ninguna alianza', 'acs_attacks', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'acs_id', af.id,
      'name', af.name,
      'creator_username', pr.username,
      'target_coords', format('[%s:%s:%s]', af.target_galaxy, af.target_system, af.target_position),
      'arrival_time', af.arrival_time,
      'current_participants', COALESCE(af.current_participants, 1),
      'max_participants', af.max_fleets
    )
  ), '[]'::jsonb)
  INTO v_acs_list
  FROM acs_fleets af
  JOIN profiles pr ON af.creator_id = pr.id
  WHERE af.alliance_id = v_user_alliance_id
  AND af.is_active = true
  AND af.status = 'waiting'
  AND af.arrival_time > NOW()
  AND COALESCE(af.current_participants, 1) < af.max_fleets
  AND af.creator_id != v_user_id;

  RETURN v_acs_list;
END;
$$;

-- Update create_acs_from_fleet to set creator_id
CREATE OR REPLACE FUNCTION create_acs_from_fleet(p_fleet_id uuid, p_acs_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fleet record;
  v_alliance_id uuid;
  v_acs_id uuid;
  v_acs_name text;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_fleet FROM fleets 
  WHERE id = p_fleet_id 
  AND user_id = v_user_id
  AND mission_type = 'attack'
  AND is_returning = false 
  AND is_completed = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada o no es una mision de ataque valida');
  END IF;

  IF v_fleet.acs_id IS NOT NULL OR v_fleet.is_acs = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya forma parte de un ACS');
  END IF;

  SELECT alliance_id INTO v_alliance_id FROM alliance_members WHERE user_id = v_user_id;
  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro de una alianza para crear un ataque ACS');
  END IF;

  v_acs_name := COALESCE(NULLIF(TRIM(p_acs_name), ''), 'ACS-' || substr(p_fleet_id::text, 1, 8));

  INSERT INTO acs_fleets (
    main_fleet_id, alliance_id, name, creator_id,
    target_galaxy, target_system, target_position,
    arrival_time, max_fleets, is_active, status, 
    current_participants, invited_users
  ) VALUES (
    p_fleet_id, v_alliance_id, v_acs_name, v_user_id,
    v_fleet.target_galaxy, v_fleet.target_system, v_fleet.target_position,
    v_fleet.arrival_time, 5, true, 'waiting',
    1, ARRAY[]::uuid[]
  ) RETURNING id INTO v_acs_id;

  UPDATE fleets SET acs_id = v_acs_id, is_acs = true WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (v_acs_id, p_fleet_id, v_user_id);

  RETURN jsonb_build_object(
    'success', true, 
    'acs_id', v_acs_id,
    'message', format('Ataque ACS "%s" creado exitosamente', v_acs_name)
  );
END;
$$;
