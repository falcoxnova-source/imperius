CREATE OR REPLACE FUNCTION public.validate_fleet_mission(p_user_id uuid, p_origin_planet_id uuid, p_target_galaxy integer, p_target_system integer, p_target_position integer, p_mission_type text, p_target_type text DEFAULT 'planet'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_expedition_result jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
  v_depot_level integer;
  v_stationed_count integer;
  v_max_stationed integer;
  v_is_fortress boolean;
BEGIN
  -- Check if target is a fortress coordinate
  v_is_fortress := (p_target_system = 250 AND p_target_position = 8);

  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;
  
  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Use p_target_type to find the correct planet or moon
  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode 
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = p_target_type
    AND NOT p.is_destroyed;

  IF v_target_planet IS NOT NULL 
     AND v_target_planet.target_vacation_mode = true 
     AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes atacar a jugadores en modo vacaciones'
    );
  END IF;

  -- ===========================================
  -- COLONIZE MISSION
  -- ===========================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed AND planet_type = 'planet';

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- EXPEDITION MISSION
  -- ===========================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    
    v_expedition_result := charge_expedition_fee(p_user_id);
    
    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;
    
    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- ===========================================
  -- ATTACK / ESPIONAGE / DESTROY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    -- Allow fortress at system 250 position 8
    IF v_target_planet IS NULL AND NOT v_is_fortress THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- For fortress attacks, skip planet ownership checks
    IF NOT v_is_fortress THEN
      IF v_target_planet.user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
      END IF;

      v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
      IF NOT (v_protection_check->>'can_attack')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
      END IF;

      IF p_mission_type IN ('attack', 'destroy') THEN
        v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
        IF NOT (v_bashing_check->>'allowed')::boolean THEN
          RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
        END IF;
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    -- Allow fortress deploys even without a planet
    IF v_target_planet IS NULL AND NOT v_is_fortress THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta ni luna en esas coordenadas');
    END IF;

    -- Fortress: allow deploy/transport for alliance members only
    IF v_is_fortress THEN
      -- Check user is in an alliance
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Necesitas pertenecer a una alianza para enviar naves a la fortaleza');
      END IF;
      
      -- Check fortress exists
      IF NOT EXISTS (SELECT 1 FROM alliance_fortresses WHERE galaxy = p_target_galaxy) THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'No hay fortaleza en esta galaxia');
      END IF;

      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Normal planet deploy/transport logic
    IF p_mission_type = 'transport' THEN
      -- Transport to own planets/moons: always allowed
      IF v_target_planet.user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', true);
      END IF;

      -- Transport to other players: BLOCKED ??? only own colonies allowed
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Solo puedes transportar recursos a tus propias colonias'
      );
    END IF;

    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      SELECT alliance_id INTO v_user_alliance_id FROM alliance_members WHERE user_id = p_user_id;
      SELECT alliance_id INTO v_target_alliance_id FROM alliance_members WHERE user_id = v_target_planet.user_id;

      IF v_user_alliance_id IS NULL OR v_target_alliance_id IS NULL OR v_user_alliance_id != v_target_alliance_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en planetas de tu alianza');
      END IF;

      SELECT COALESCE(pb.level, 0) INTO v_depot_level
      FROM planet_buildings pb
      JOIN building_types bt ON pb.building_type_id = bt.id
      WHERE pb.planet_id = v_target_planet.id AND bt.code = 'alliance_depot';

      IF COALESCE(v_depot_level, 0) < 1 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'El planeta aliado necesita Deposito de Alianza nivel 1 o superior');
      END IF;

      v_max_stationed := COALESCE(v_depot_level, 0);

      SELECT COUNT(*) INTO v_stationed_count
      FROM fleets f
      WHERE f.target_galaxy = p_target_galaxy
        AND f.target_system = p_target_system
        AND f.target_position = p_target_position
        AND f.mission_type = 'deploy'
        AND f.is_completed = false
        AND f.is_returning = false
        AND f.user_id != v_target_planet.user_id;

      IF v_stationed_count >= v_max_stationed THEN
        RETURN jsonb_build_object(
          'valid', false,
          'reason', format('El Deposito de Alianza nivel %s solo permite %s flota(s) estacionada(s). Actualmente hay %s.', v_depot_level, v_max_stationed, v_stationed_count)
        );
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- RECYCLE MISSION
  -- ===========================================
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$function$

