CREATE OR REPLACE FUNCTION public.get_incoming_attacks(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
  v_defender_spy_level integer;
  v_alliance_id uuid;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_defender_spy_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'espionage_tech';
  v_defender_spy_level := COALESCE(v_defender_spy_level, 0);

  -- Alianza del usuario (para detectar ataques a su fortaleza)
  SELECT alliance_id INTO v_alliance_id
  FROM alliance_members
  WHERE user_id = p_user_id
  LIMIT 1;

  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    -- ===== Ataques a PLANETAS/LUNAS del usuario =====
    SELECT
      f.id AS fleet_id,
      f.mission_type,
      f.departure_time,
      f.arrival_time,
      f.is_returning,
      f.target_galaxy,
      f.target_system,
      f.target_position,
      f.target_type,
      p_target.name AS target_planet_name,
      p_origin.galaxy AS origin_galaxy,
      p_origin.solar_system AS origin_system,
      p_origin.position AS origin_position,
      attacker.username AS attacker_name,
      COALESCE(attacker_spy.level, 0) AS attacker_spy_level,
      CASE
        WHEN v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0 THEN (
          SELECT json_agg(json_build_object(
            'ship_name', st.name,
            'ship_code', st.code,
            'quantity', fs.quantity
          ))
          FROM fleet_ships fs
          JOIN ship_types st ON st.id = fs.ship_type_id
          WHERE fs.fleet_id = f.id
            AND fs.quantity > 0
        )
        ELSE NULL
      END AS ships,
      (v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0) AS can_see_fleet
    FROM fleets f
    JOIN planets p_target
      ON p_target.galaxy = f.target_galaxy
     AND p_target.solar_system = f.target_system
     AND p_target.position = f.target_position
     AND p_target.planet_type = COALESCE(f.target_type, 'planet')
     AND p_target.is_destroyed = false
    JOIN planets p_origin ON p_origin.id = f.origin_planet_id
    JOIN profiles attacker ON attacker.id = f.user_id
    LEFT JOIN user_technologies attacker_spy ON attacker_spy.user_id = f.user_id
      AND attacker_spy.technology_type_id = (
        SELECT id FROM technology_types WHERE code = 'espionage_tech' LIMIT 1
      )
    WHERE f.is_completed = false
      AND f.is_returning = false
      AND f.user_id != p_user_id
      AND p_target.user_id = p_user_id
      AND f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')

    UNION ALL

    -- ===== Ataques a la FORTALEZA de la alianza del usuario =====
    SELECT
      f.id AS fleet_id,
      f.mission_type,
      f.departure_time,
      f.arrival_time,
      f.is_returning,
      f.target_galaxy,
      f.target_system,
      f.target_position,
      f.target_type,
      ('Fortaleza (G' || f.target_galaxy || ')') AS target_planet_name,
      p_origin.galaxy AS origin_galaxy,
      p_origin.solar_system AS origin_system,
      p_origin.position AS origin_position,
      attacker.username AS attacker_name,
      COALESCE(attacker_spy.level, 0) AS attacker_spy_level,
      CASE
        WHEN v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0 THEN (
          SELECT json_agg(json_build_object(
            'ship_name', st.name,
            'ship_code', st.code,
            'quantity', fs.quantity
          ))
          FROM fleet_ships fs
          JOIN ship_types st ON st.id = fs.ship_type_id
          WHERE fs.fleet_id = f.id
            AND fs.quantity > 0
        )
        ELSE NULL
      END AS ships,
      (v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0) AS can_see_fleet
    FROM fleets f
    JOIN alliance_fortresses af
      ON af.owner_alliance_id = v_alliance_id
     AND af.galaxy = f.target_galaxy
     AND af.system = f.target_system
     AND af.position = f.target_position
    JOIN planets p_origin ON p_origin.id = f.origin_planet_id
    JOIN profiles attacker ON attacker.id = f.user_id
    LEFT JOIN user_technologies attacker_spy ON attacker_spy.user_id = f.user_id
      AND attacker_spy.technology_type_id = (
        SELECT id FROM technology_types WHERE code = 'espionage_tech' LIMIT 1
      )
    WHERE v_alliance_id IS NOT NULL
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.user_id != p_user_id
      AND (
        f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')
        OR (
          -- deploy/transport de un jugador que NO pertenece a la alianza duenia
          -- de la fortaleza = ataque encubierto -> tambien genera alerta
          f.mission_type IN ('deploy', 'transport')
          AND NOT EXISTS (
            SELECT 1 FROM alliance_members am_att
            WHERE am_att.user_id = f.user_id
              AND am_att.alliance_id = af.owner_alliance_id
          )
        )
      )

    UNION ALL

    -- ===== [STRONGALERT1] Ataques al PLANETA DEL TESORO de la alianza del usuario =====
    SELECT
      f.id AS fleet_id,
      f.mission_type,
      f.departure_time,
      f.arrival_time,
      f.is_returning,
      f.target_galaxy,
      f.target_system,
      f.target_position,
      f.target_type,
      ('Planeta del Tesoro (G' || f.target_galaxy || ')') AS target_planet_name,
      p_origin.galaxy AS origin_galaxy,
      p_origin.solar_system AS origin_system,
      p_origin.position AS origin_position,
      attacker.username AS attacker_name,
      COALESCE(attacker_spy.level, 0) AS attacker_spy_level,
      CASE
        WHEN v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0 THEN (
          SELECT json_agg(json_build_object(
            'ship_name', st.name,
            'ship_code', st.code,
            'quantity', fs.quantity
          ))
          FROM fleet_ships fs
          JOIN ship_types st ON st.id = fs.ship_type_id
          WHERE fs.fleet_id = f.id
            AND fs.quantity > 0
        )
        ELSE NULL
      END AS ships,
      (v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0) AS can_see_fleet
    FROM fleets f
    JOIN treasure_planets tp
      ON tp.owner_alliance_id = v_alliance_id
     AND tp.galaxy = f.target_galaxy
     AND tp.system = f.target_system
     AND tp.position = f.target_position
    JOIN planets p_origin ON p_origin.id = f.origin_planet_id
    JOIN profiles attacker ON attacker.id = f.user_id
    LEFT JOIN user_technologies attacker_spy ON attacker_spy.user_id = f.user_id
      AND attacker_spy.technology_type_id = (
        SELECT id FROM technology_types WHERE code = 'espionage_tech' LIMIT 1
      )
    WHERE v_alliance_id IS NOT NULL
      AND f.is_completed = false
      AND f.is_returning = false
      AND f.user_id != p_user_id
      AND (
        f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')
        OR (
          -- deploy/transport de un jugador que NO pertenece a la alianza duenia
          -- del tesoro = ataque (process_fleet_arrival lo resuelve como combate)
          f.mission_type IN ('deploy', 'transport')
          AND NOT EXISTS (
            SELECT 1 FROM alliance_members am_att
            WHERE am_att.user_id = f.user_id
              AND am_att.alliance_id = tp.owner_alliance_id
          )
        )
      )

    ORDER BY arrival_time ASC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$

