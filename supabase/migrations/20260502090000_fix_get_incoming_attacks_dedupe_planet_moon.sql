-- =====================================================================
-- FIX: get_incoming_attacks duplicaba ataques cuando el atacante apunta
-- a coordenadas donde existen tanto un planeta como su luna.
--
-- BUG ANTERIOR:
--   El JOIN unía fleets con planets sólo por (galaxy, system, position),
--   ignorando si la flota va al PLANETA o a la LUNA. Como en las mismas
--   coordenadas pueden coexistir ambos, una sola flota generaba 2 filas
--   en el resultado.
--
-- SÍNTOMA:
--   En el panel de "Ataques Entrantes" el mismo ataque aparece duplicado:
--     - Flota Hostil → Luna [2:81:7]
--     - Flota Hostil → AKATSUKI [2:81:7]
--   (cuando el atacante en realidad sólo envió una flota)
--
-- FIX:
--   Añadir match por tipo: f.target_type = p_target.planet_type.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_incoming_attacks(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
  v_defender_spy_level integer;
BEGIN
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
     -- ✅ FIX: distinguir planeta vs luna para no duplicar el ataque
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
    ORDER BY f.arrival_time ASC
  ) t;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$;

COMMENT ON FUNCTION public.get_incoming_attacks(uuid) IS
  'Devuelve ataques entrantes contra el usuario. Fix 2026-05-02: '
  'añadido match por planet_type para no duplicar el ataque cuando '
  'existen planeta y luna en las mismas coordenadas.';
