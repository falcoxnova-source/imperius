-- =============================================================================
-- FIX: Hide enemy fleet return trips from defender's overview
-- =============================================================================
-- BUG: When an enemy fleet attacks and then returns home, the defender can
-- still see the return trip timer, origin coordinates and ship composition.
-- This leaks privileged information.
--
-- FIX: Add "is_returning = false" filter in two places:
--   1. get_incoming_attacks() RPC function
--   2. RLS policy "Users can view incoming attacks"
-- =============================================================================

-- STEP 1: Fix the RPC function - add is_returning = false
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
    JOIN planets p_target ON p_target.galaxy = f.target_galaxy 
                          AND p_target.solar_system = f.target_system 
                          AND p_target.position = f.target_position
                          AND p_target.is_destroyed = false
    JOIN planets p_origin ON p_origin.id = f.origin_planet_id
    JOIN profiles attacker ON attacker.id = f.user_id
    LEFT JOIN user_technologies attacker_spy ON attacker_spy.user_id = f.user_id
      AND attacker_spy.technology_type_id = (
        SELECT id FROM technology_types WHERE code = 'espionage_tech' LIMIT 1
      )
    WHERE f.is_completed = false
      AND f.is_returning = false  -- ← FIX: solo flotas en camino, NO en retorno
      AND f.user_id != p_user_id
      AND p_target.user_id = p_user_id
      AND f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')
    ORDER BY f.arrival_time ASC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_incoming_attacks(uuid) TO authenticated;

-- STEP 2: Fix the RLS policy - add is_returning = false
DROP POLICY IF EXISTS "Users can view incoming attacks" ON fleets;

CREATE POLICY "Users can view incoming attacks"
  ON fleets FOR SELECT
  TO authenticated
  USING (
    is_returning = false AND  -- ← FIX: solo flotas en camino, NO en retorno
    mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack') AND
    EXISTS (
      SELECT 1 FROM planets
      WHERE planets.galaxy = fleets.target_galaxy
      AND planets.solar_system = fleets.target_system
      AND planets.position = fleets.target_position
      AND planets.user_id = auth.uid()
    )
  );
