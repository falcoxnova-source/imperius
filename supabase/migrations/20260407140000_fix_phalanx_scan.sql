-- Fix Sensor Phalanx function: 
-- 1. LEFT JOIN bug: was picking level from ANY building, not specifically sensor_phalanx
-- 2. Error key mismatch: function returned 'reason' but frontend expects 'error'
-- Both bugs combined caused invisible error messages making phalanx appear "broken"

CREATE OR REPLACE FUNCTION phalanx_scan(
  p_moon_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
    DECLARE
      v_moon record;
      v_phalanx_level integer;
      v_phalanx_range integer;
      v_system_distance integer;
      v_target_planet record;
      v_fleets jsonb;
      v_deuterium_cost integer;
    BEGIN
      -- Verify caller is authenticated
      IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
      END IF;

      -- Get moon info (planet data only, no building join here)
      SELECT p.*
      INTO v_moon
      FROM planets p
      WHERE p.id = p_moon_id 
        AND p.planet_type = 'moon'
        AND p.user_id = auth.uid();

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Luna no encontrada o no es tuya');
      END IF;

      -- Get phalanx level SPECIFICALLY (separate clean query)
      SELECT COALESCE(pb.level, 0)
      INTO v_phalanx_level
      FROM building_types bt
      LEFT JOIN planet_buildings pb 
        ON pb.building_type_id = bt.id 
        AND pb.planet_id = p_moon_id
      WHERE bt.code = 'sensor_phalanx';

      -- If building_type doesn't exist or level is 0
      IF v_phalanx_level IS NULL OR v_phalanx_level = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No tienes Sensor Phalanx en esta luna');
      END IF;

      -- Same galaxy only
      IF v_moon.galaxy != p_target_galaxy THEN
        RETURN jsonb_build_object('success', false, 'error', 'Solo puedes escanear en tu misma galaxia');
      END IF;

      -- Range: level^2 - 1 systems
      v_phalanx_range := (v_phalanx_level * v_phalanx_level) - 1;
      v_system_distance := ABS(v_moon.solar_system - p_target_system);

      IF v_system_distance > v_phalanx_range THEN
        RETURN jsonb_build_object(
          'success', false, 
          'error', format('Fuera de alcance. Rango: %s sistemas, Distancia: %s', v_phalanx_range, v_system_distance)
        );
      END IF;

      -- Target must be an enemy planet (not moon, not own)
      SELECT * INTO v_target_planet
      FROM planets
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND planet_type = 'planet'
        AND user_id IS NOT NULL
        AND user_id != v_moon.user_id;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No hay planeta enemigo en esas coordenadas');
      END IF;

      -- Cost: 5000 deuterium from the MOON itself
      v_deuterium_cost := 5000;

      UPDATE planet_resources
      SET deuterium = deuterium - v_deuterium_cost
      WHERE planet_id = p_moon_id
        AND deuterium >= v_deuterium_cost;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', format('Deuterio insuficiente en la luna (%s requerido)', v_deuterium_cost));
      END IF;

      -- Get all fleets going TO or returning FROM that planet
      SELECT jsonb_agg(fleet_data ORDER BY (fleet_data->>'arrival_time'))
      INTO v_fleets
      FROM (
        SELECT jsonb_build_object(
          'id', f.id,
          'mission', f.mission_type,
          'origin', format('[%s:%s:%s]', 
            op.galaxy, op.solar_system, op.position
          ),
          'destination', format('[%s:%s:%s]',
            f.target_galaxy, f.target_system, f.target_position
          ),
          'arrival_time', f.arrival_time,
          'return_time', f.return_time,
          'is_returning', f.is_returning,
          'ships', (
            SELECT jsonb_agg(jsonb_build_object('type', st.name, 'quantity', fs.quantity))
            FROM fleet_ships fs
            JOIN ship_types st ON fs.ship_type_id = st.id
            WHERE fs.fleet_id = f.id AND fs.quantity > 0
          )
        ) as fleet_data
        FROM fleets f
        JOIN planets op ON f.origin_planet_id = op.id
        WHERE f.is_completed = false
          AND (
            -- Fleets heading to target planet (not returning)
            (f.target_galaxy = p_target_galaxy 
             AND f.target_system = p_target_system 
             AND f.target_position = p_target_position 
             AND NOT f.is_returning)
            OR 
            -- Fleets returning from target planet
            (f.origin_planet_id = v_target_planet.id AND f.is_returning)
          )
      ) sub;

      RETURN jsonb_build_object(
        'success', true,
        'planet_name', v_target_planet.name,
        'player', (SELECT username FROM profiles WHERE id = v_target_planet.user_id),
        'coordinates', format('[%s:%s:%s]', p_target_galaxy, p_target_system, p_target_position),
        'fleets', COALESCE(v_fleets, '[]'::jsonb),
        'deuterium_used', v_deuterium_cost,
        'phalanx_level', v_phalanx_level,
        'phalanx_range', v_phalanx_range
      );
    END;
$$;

-- Ensure authenticated role can execute
GRANT EXECUTE ON FUNCTION phalanx_scan(uuid, integer, integer, integer) TO authenticated;
