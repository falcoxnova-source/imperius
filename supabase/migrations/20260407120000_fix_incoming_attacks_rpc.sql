-- =============================================================================
-- FIX: get_incoming_attacks RPC
-- =============================================================================
-- PROBLEMA CRÍTICO: La versión anterior referenciaba f.target_planet_id que
-- NO EXISTE en la tabla fleets. La tabla fleets solo tiene:
--   target_galaxy, target_system, target_position (coordenadas)
--   origin_planet_id (FK a planets)
-- 
-- Esto causaba que la función fallara silenciosamente y NUNCA devolviera
-- ataques entrantes a los jugadores.
--
-- CORRECCIONES:
-- 1. Resuelve el planeta objetivo haciendo JOIN por coordenadas (galaxy, 
--    solar_system, position) en vez de por target_planet_id inexistente.
-- 2. Agrega coordenadas de ORIGEN del ataque (de dónde viene la flota).
-- 3. Agrega visibilidad de naves basada en nivel de espionaje del defensor
--    vs nivel de espionaje del atacante (mecánica OGame).
-- 4. Agrega departure_time para cálculos de progreso en el frontend.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_incoming_attacks(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
  v_defender_spy_level integer;
BEGIN
  -- Obtener nivel de espionaje del defensor
  SELECT COALESCE(ut.level, 0) INTO v_defender_spy_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'espionage_tech';
  v_defender_spy_level := COALESCE(v_defender_spy_level, 0);

  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT
      f.id AS fleet_id,
      f.mission_type,
      f.departure_time,
      f.arrival_time,
      f.is_returning,
      -- Coordenadas del objetivo
      f.target_galaxy,
      f.target_system,
      f.target_position,
      p_target.name AS target_planet_name,
      -- Coordenadas de ORIGEN del ataque
      p_origin.galaxy AS origin_galaxy,
      p_origin.solar_system AS origin_system,
      p_origin.position AS origin_position,
      -- Info del atacante
      attacker.username AS attacker_name,
      -- Nivel de espionaje del atacante para comparar
      COALESCE(attacker_spy.level, 0) AS attacker_spy_level,
      -- Composición de flota: solo visible si defensor tiene suficiente nivel de espionaje
      -- En OGame: se ve la composición si la diferencia de espionaje (defensor - atacante) >= 0
      -- Es decir, si tu nivel de espionaje es >= al del atacante
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
      -- Indicar al frontend si puede ver la flota o no
      (v_defender_spy_level - COALESCE(attacker_spy.level, 0) >= 0) AS can_see_fleet
    FROM fleets f
    -- Resolver planeta objetivo por coordenadas
    JOIN planets p_target ON p_target.galaxy = f.target_galaxy 
                          AND p_target.solar_system = f.target_system 
                          AND p_target.position = f.target_position
                          AND p_target.is_destroyed = false
    -- Obtener planeta de origen para coordenadas de origen
    JOIN planets p_origin ON p_origin.id = f.origin_planet_id
    -- Info del atacante
    JOIN profiles attacker ON attacker.id = f.user_id
    -- Nivel de espionaje del atacante
    LEFT JOIN user_technologies attacker_spy ON attacker_spy.user_id = f.user_id
      AND attacker_spy.technology_type_id = (
        SELECT id FROM technology_types WHERE code = 'espionage_tech' LIMIT 1
      )
    WHERE f.is_completed = false
      AND f.user_id != p_user_id
      -- El planeta objetivo pertenece al usuario defensor
      AND p_target.user_id = p_user_id
      AND f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')
    ORDER BY f.arrival_time ASC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- Asegurar que los usuarios autenticados pueden ejecutar la función
GRANT EXECUTE ON FUNCTION get_incoming_attacks(uuid) TO authenticated;
