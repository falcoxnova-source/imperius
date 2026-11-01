CREATE OR REPLACE FUNCTION public.create_acs_from_fleet(p_fleet_id uuid, p_acs_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fleet record;
  v_alliance_id uuid;
  v_acs_id uuid;
  v_acs_name text;
  v_user_id uuid;
  v_depot_level integer;
  v_max_fleets integer;
  v_depot_type_id integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no autenticado');
  END IF;

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
    RETURN jsonb_build_object('success', false, 'error', 'Esta flota ya forma parte de un ataque ACS');
  END IF;

  SELECT alliance_id INTO v_alliance_id FROM alliance_members WHERE user_id = v_user_id;
  IF v_alliance_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Debes ser miembro de una alianza para crear un ataque ACS');
  END IF;

  -- Alliance Depot level on the ORIGIN planet drives the ACS slot count.
  -- Formula (XNova classic): slots = min(5, 1 + floor(depot_level / 2))
  SELECT id INTO v_depot_type_id FROM building_types WHERE code = 'alliance_depot';

  IF v_depot_type_id IS NOT NULL AND v_fleet.origin_planet_id IS NOT NULL THEN
    SELECT COALESCE(pb.level, 0) INTO v_depot_level
    FROM planet_buildings pb
    WHERE pb.planet_id = v_fleet.origin_planet_id
      AND pb.building_type_id = v_depot_type_id;
  END IF;

  v_depot_level := COALESCE(v_depot_level, 0);

  -- Intuitive message instead of a raw error when there is no Alliance Depot:
  -- without it there are no slots for allied fleets, so an ACS makes no sense.
  IF v_depot_level < 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Necesitas un Deposito de la Alianza (nivel 1 o superior) en el planeta de origen para coordinar un ataque ACS. Construyelo en la seccion de Instalaciones.'
    );
  END IF;

  v_max_fleets := LEAST(5, 1 + FLOOR(v_depot_level / 2)::integer);

  v_acs_name := COALESCE(NULLIF(TRIM(p_acs_name), ''), 'ACS-' || substr(p_fleet_id::text, 1, 8));

  INSERT INTO acs_fleets (
    main_fleet_id, alliance_id, name, creator_id,
    target_galaxy, target_system, target_position,
    arrival_time, max_fleets, is_active, status,
    current_participants, invited_users
  ) VALUES (
    p_fleet_id, v_alliance_id, v_acs_name, v_user_id,
    v_fleet.target_galaxy, v_fleet.target_system, v_fleet.target_position,
    v_fleet.arrival_time, v_max_fleets, true, 'waiting',
    1, ARRAY[]::uuid[]
  ) RETURNING id INTO v_acs_id;

  UPDATE fleets SET acs_id = v_acs_id, is_acs = true WHERE id = p_fleet_id;

  INSERT INTO acs_participants (acs_id, fleet_id, user_id)
  VALUES (v_acs_id, p_fleet_id, v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'acs_id', v_acs_id,
    'max_fleets', v_max_fleets,
    'message', format('Ataque ACS "%s" creado exitosamente. Slots disponibles: %s.', v_acs_name, v_max_fleets)
  );
END;
$function$

