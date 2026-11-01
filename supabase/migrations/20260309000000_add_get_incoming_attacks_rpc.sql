-- =============================================================================
-- RPC: get_incoming_attacks
-- =============================================================================
-- Devuelve las flotas hostiles que se dirigen a los planetas del usuario.
-- Incluye composición de la flota (naves) y datos del atacante.
-- También detecta flotas que se retiraron (is_returning = true).
-- =============================================================================

CREATE OR REPLACE FUNCTION get_incoming_attacks(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO v_result
  FROM (
    SELECT
      f.id AS fleet_id,
      f.mission_type,
      f.arrival_time,
      f.is_returning,
      f.target_galaxy,
      f.target_system,
      f.target_position,
      p_target.name AS target_planet_name,
      attacker.username AS attacker_name,
      (
        SELECT json_agg(json_build_object(
          'ship_name', st.name,
          'ship_code', st.code,
          'quantity', fs.quantity
        ))
        FROM fleet_ships fs
        JOIN ship_types st ON st.id = fs.ship_type_id
        WHERE fs.fleet_id = f.id
          AND fs.quantity > 0
      ) AS ships
    FROM fleets f
    JOIN planets p_target ON p_target.id = f.target_planet_id
    JOIN profiles attacker ON attacker.id = f.user_id
    WHERE f.is_completed = false
      AND f.user_id != p_user_id
      AND f.target_planet_id IN (
        SELECT id FROM planets WHERE user_id = p_user_id AND is_destroyed = false
      )
      AND f.mission_type IN ('attack', 'destroy', 'acs_attack', 'missile_attack')
    ORDER BY f.arrival_time ASC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;
