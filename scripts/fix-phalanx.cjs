const { Client } = require('pg');
const client = new Client({
  host: 'aws-1-eu-north-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.hhrgcnvydmjqcevgmlhj',
  password: 'Jfs.samsung1989*',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  // Fix phalanx_scan function:
  // 1. SECURITY DEFINER (needed for RPC from frontend)
  // 2. Deut should come from the MOON itself (not main planet) - like original OGame
  // 3. Also detect fleets going to/from the target's moon at same coords
  await client.query(`
    CREATE OR REPLACE FUNCTION public.phalanx_scan(
      p_moon_id uuid,
      p_target_galaxy integer,
      p_target_system integer,
      p_target_position integer
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $function$
    DECLARE
      v_moon record;
      v_phalanx_level integer;
      v_phalanx_range integer;
      v_system_distance integer;
      v_target_planet record;
      v_fleets jsonb;
      v_deuterium_cost integer;
    BEGIN
      -- Verify caller owns the moon
      IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'No autenticado');
      END IF;

      -- Get moon + phalanx level
      SELECT p.*, pb.level as phalanx_level
      INTO v_moon
      FROM planets p
      LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
      LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'sensor_phalanx'
      WHERE p.id = p_moon_id 
        AND p.planet_type = 'moon'
        AND p.user_id = auth.uid();

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'Luna no encontrada o no es tuya');
      END IF;

      v_phalanx_level := COALESCE(v_moon.phalanx_level, 0);

      IF v_phalanx_level = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'No tienes Sensor Phalanx en esta luna');
      END IF;

      -- Same galaxy only
      IF v_moon.galaxy != p_target_galaxy THEN
        RETURN jsonb_build_object('success', false, 'reason', 'Solo puedes escanear en tu misma galaxia');
      END IF;

      -- Range: level^2 - 1 systems
      v_phalanx_range := (v_phalanx_level * v_phalanx_level) - 1;
      v_system_distance := ABS(v_moon.solar_system - p_target_system);

      IF v_system_distance > v_phalanx_range THEN
        RETURN jsonb_build_object(
          'success', false, 
          'reason', format('Fuera de alcance. Rango: %s sistemas, Distancia: %s', v_phalanx_range, v_system_distance)
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
        RETURN jsonb_build_object('success', false, 'reason', 'No hay planeta enemigo en esas coordenadas');
      END IF;

      -- Cost: 5000 deuterium from the MOON itself
      v_deuterium_cost := 5000;

      UPDATE planet_resources
      SET deuterium = deuterium - v_deuterium_cost
      WHERE planet_id = p_moon_id
        AND deuterium >= v_deuterium_cost;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', format('Deuterio insuficiente en la luna (%s requerido)', v_deuterium_cost));
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
    $function$;
  `);

  console.log('✅ phalanx_scan actualizada en producción');

  // Verify
  const fn = await client.query(`
    SELECT prosrc, prosecdef FROM pg_proc
    WHERE proname = 'phalanx_scan'
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  `);
  const body = fn.rows[0].prosrc;
  console.log('\nVerificación:');
  console.log('  SECURITY DEFINER:', fn.rows[0].prosecdef ? '✅' : '❌');
  console.log('  Deut from moon (planet_id = p_moon_id):', body.includes('planet_id = p_moon_id') ? '✅' : '❌');
  console.log('  auth.uid() check:', body.includes('auth.uid()') ? '✅' : '❌');
  console.log('  Range formula (level*level)-1:', body.includes('v_phalanx_level * v_phalanx_level') ? '✅' : '❌');
  console.log('  Only planets (not moons):', body.includes("planet_type = 'planet'") ? '✅' : '❌');
  console.log('  Cannot scan own:', body.includes('user_id != v_moon.user_id') ? '✅' : '❌');

  await client.end();
}
run().catch(e => { console.error(e); process.exit(1); });
