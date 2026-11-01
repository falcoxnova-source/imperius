/*
  # Fix missile silo range calculation

  ## Problem
  The missile range was hardcoded to 5 solar systems, ignoring the silo level.

  ## Solution
  Each level of the missile silo should add 10 solar systems of range.
  - Silo level 1 = 10 systems range
  - Silo level 2 = 20 systems range
  - Silo level 5 = 50 systems range
  - etc.

  ## Changes
  - Updated launch_missiles function to calculate range based on silo level
  - Range is calculated as: silo_level * 10 solar systems
*/

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.launch_missiles(uuid, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.launch_missiles(uuid, integer, integer, integer, integer, text);

CREATE OR REPLACE FUNCTION public.launch_missiles(
  p_origin_planet_id uuid, 
  p_target_galaxy integer, 
  p_target_system integer, 
  p_target_position integer, 
  p_missile_count integer,
  p_primary_target text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_planet record;
  v_target_planet record;
  v_available_missiles integer;
  v_abm_count integer;
  v_effective_missiles integer;
  v_silo_level integer;
  v_max_range integer;
  v_actual_distance integer;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_defense_record record;
  v_remaining_damage integer;
  v_defense_destroyed integer;
BEGIN
  -- Get origin planet with silo level
  SELECT p.*, 
         COALESCE(pb.level, 0) as silo_level
  INTO v_origin_planet
  FROM planets p
  LEFT JOIN planet_buildings pb ON p.id = pb.planet_id
  LEFT JOIN building_types bt ON pb.building_type_id = bt.id AND bt.code = 'missile_silo'
  WHERE p.id = p_origin_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Planeta de origen no encontrado');
  END IF;

  -- Get silo level (need separate query for accurate result)
  SELECT COALESCE(pb.level, 0) INTO v_silo_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_origin_planet_id AND bt.code = 'missile_silo';
  
  v_silo_level := COALESCE(v_silo_level, 0);

  -- Check if silo exists
  IF v_silo_level < 1 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Necesitas un Silo de Misiles para lanzar misiles');
  END IF;

  -- Get available missiles from defense table
  SELECT COALESCE(pd.quantity, 0) INTO v_available_missiles
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_origin_planet_id AND dt.code = 'interplanetary_missile';

  v_available_missiles := COALESCE(v_available_missiles, 0);

  IF v_available_missiles < p_missile_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', format('Solo tienes %s misiles interplanetarios', v_available_missiles)
    );
  END IF;

  -- Get target planet
  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Planeta objetivo no encontrado');
  END IF;

  -- Calculate max range based on silo level (10 solar systems per level)
  v_max_range := v_silo_level * 10;

  -- Check if same galaxy
  IF v_origin_planet.galaxy != p_target_galaxy THEN
    RETURN jsonb_build_object('success', false, 'reason', 'Los misiles solo pueden alcanzar objetivos en la misma galaxia');
  END IF;

  -- Calculate actual distance in solar systems
  v_actual_distance := ABS(v_origin_planet.solar_system - p_target_system);

  IF v_actual_distance > v_max_range THEN
    RETURN jsonb_build_object(
      'success', false, 
      'reason', format('El objetivo esta fuera de alcance. Tu silo nivel %s tiene alcance de %s sistemas solares. Distancia al objetivo: %s sistemas.', 
        v_silo_level, v_max_range, v_actual_distance)
    );
  END IF;

  -- Get ABM count from target
  SELECT COALESCE(pd.quantity, 0) INTO v_abm_count
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = v_target_planet.id AND dt.code = 'anti_ballistic_missile';

  v_abm_count := COALESCE(v_abm_count, 0);

  -- Calculate effective missiles after ABM interception
  v_effective_missiles := GREATEST(0, p_missile_count - v_abm_count);

  -- Deduct missiles from origin planet
  UPDATE planet_defenses pd
  SET quantity = quantity - p_missile_count
  FROM defense_types dt
  WHERE pd.defense_type_id = dt.id 
    AND pd.planet_id = p_origin_planet_id 
    AND dt.code = 'interplanetary_missile';

  -- Deduct ABMs from target (they are consumed intercepting)
  IF v_abm_count > 0 THEN
    UPDATE planet_defenses pd
    SET quantity = GREATEST(0, quantity - p_missile_count)
    FROM defense_types dt
    WHERE pd.defense_type_id = dt.id 
      AND pd.planet_id = v_target_planet.id 
      AND dt.code = 'anti_ballistic_missile';
  END IF;

  -- Destroy defenses if effective missiles > 0
  IF v_effective_missiles > 0 THEN
    -- Each missile has damage of 12000 structural points
    v_remaining_damage := v_effective_missiles * 12000;
    
    -- Destroy defenses starting from weakest (or primary target if specified)
    FOR v_defense_record IN 
      SELECT pd.id, pd.quantity, dt.structural_integrity, dt.name, dt.code
      FROM planet_defenses pd
      JOIN defense_types dt ON pd.defense_type_id = dt.id
      WHERE pd.planet_id = v_target_planet.id 
        AND pd.quantity > 0
        AND dt.code NOT IN ('anti_ballistic_missile', 'interplanetary_missile')
      ORDER BY 
        CASE WHEN dt.code = p_primary_target THEN 0 ELSE 1 END,
        dt.structural_integrity ASC
    LOOP
      IF v_remaining_damage <= 0 THEN EXIT; END IF;
      
      -- Calculate how many can be destroyed
      v_defense_destroyed := LEAST(
        v_defense_record.quantity,
        v_remaining_damage / GREATEST(1, v_defense_record.structural_integrity)
      );
      
      IF v_defense_destroyed > 0 THEN
        v_remaining_damage := v_remaining_damage - (v_defense_destroyed * v_defense_record.structural_integrity);
        
        UPDATE planet_defenses 
        SET quantity = quantity - v_defense_destroyed 
        WHERE id = v_defense_record.id;
        
        v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
          'name', v_defense_record.name,
          'quantity', v_defense_destroyed
        );
      END IF;
    END LOOP;
  END IF;

  -- Send message to defender
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    NULL,
    v_target_planet.user_id,
    'Ataque de Misiles!',
    format(E'Tu planeta %s en [%s:%s:%s] ha sido atacado con %s misiles interplanetarios.\n\n%s fueron interceptados por tus ABM.\n%s misiles impactaron.\n\nDefensas destruidas: %s',
      v_target_planet.name, 
      p_target_galaxy, p_target_system, p_target_position,
      p_missile_count, 
      LEAST(v_abm_count, p_missile_count),
      v_effective_missiles,
      CASE WHEN jsonb_array_length(v_destroyed_defenses) > 0 
        THEN (SELECT string_agg(format('%s x%s', elem->>'name', elem->>'quantity'), ', ') 
              FROM jsonb_array_elements(v_destroyed_defenses) elem)
        ELSE 'Ninguna'
      END
    ),
    'battle'
  );

  -- Send confirmation to attacker
  INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
  VALUES (
    NULL,
    v_origin_planet.user_id,
    'Misiles Lanzados',
    format(E'Has lanzado %s misiles interplanetarios a [%s:%s:%s].\n\n%s fueron interceptados.\n%s impactaron en el objetivo.\n\nDefensas destruidas: %s',
      p_missile_count,
      p_target_galaxy, p_target_system, p_target_position,
      LEAST(v_abm_count, p_missile_count),
      v_effective_missiles,
      CASE WHEN jsonb_array_length(v_destroyed_defenses) > 0 
        THEN (SELECT string_agg(format('%s x%s', elem->>'name', elem->>'quantity'), ', ') 
              FROM jsonb_array_elements(v_destroyed_defenses) elem)
        ELSE 'Ninguna'
      END
    ),
    'battle'
  );

  RETURN jsonb_build_object(
    'success', true,
    'missiles_launched', p_missile_count,
    'missiles_intercepted', LEAST(v_abm_count, p_missile_count),
    'missiles_effective', v_effective_missiles,
    'destroyed_defenses', v_destroyed_defenses,
    'silo_level', v_silo_level,
    'max_range', v_max_range
  );
END;
$function$;
