/*
  # Fix Missile System - XNova Authentic
  
  ## Changes
  1. Correct range formula: (impulse_drive_level * 5) - 1 systems
  2. Silo level 4 minimum required to launch IPM
  3. IPM damage = 12,000 structural points per missile
  4. ABM intercepts 1:1 ratio
  5. Destruction order: primary target first, then weakest defenses
  6. Unify into single launch_missiles function
  
  ## XNova Original Rules
  - Range depends on Impulse Drive, NOT silo level
  - Silo capacity = level * 10 missiles (ABM + IPM share space)
  - Each IPM deals 12,000 structural damage
  - ABMs are consumed when intercepting
*/

-- Drop the duplicate function
DROP FUNCTION IF EXISTS launch_interplanetary_missile(uuid, uuid, integer, integer, integer, text, integer);

-- Recreate the unified missile launch function with correct XNova logic
CREATE OR REPLACE FUNCTION launch_missiles(
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
SET search_path = public
AS $$
DECLARE
  v_origin_planet record;
  v_target_planet record;
  v_target_owner record;
  v_attacker_id uuid;
  v_available_missiles integer;
  v_abm_count integer;
  v_effective_missiles integer;
  v_silo_level integer;
  v_impulse_level integer;
  v_max_range integer;
  v_actual_distance integer;
  v_destroyed_defenses jsonb := '[]'::jsonb;
  v_defense_record record;
  v_remaining_damage integer;
  v_defense_destroyed integer;
  v_ipm_damage_per_missile CONSTANT integer := 12000;
BEGIN
  -- Get origin planet
  SELECT p.*, p.user_id as owner_id
  INTO v_origin_planet
  FROM planets p
  WHERE p.id = p_origin_planet_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planeta de origen no encontrado');
  END IF;

  v_attacker_id := v_origin_planet.owner_id;

  -- Get silo level
  SELECT COALESCE(pb.level, 0) INTO v_silo_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_origin_planet_id AND bt.code = 'missile_silo';

  v_silo_level := COALESCE(v_silo_level, 0);

  -- Silo level 4 minimum required to have IPM
  IF v_silo_level < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Silo de Misiles nivel 4 para lanzar misiles interplanetarios');
  END IF;

  -- Get impulse drive level (determines range)
  SELECT COALESCE(ut.level, 0) INTO v_impulse_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_attacker_id AND tt.code = 'impulse_drive';

  v_impulse_level := COALESCE(v_impulse_level, 0);

  -- XNova formula: Range = (impulse_drive_level * 5) - 1 systems
  -- Minimum impulse drive level 1 required (gives range of 4 systems)
  IF v_impulse_level < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Necesitas Motor de Impulso nivel 1 para lanzar misiles');
  END IF;

  v_max_range := (v_impulse_level * 5) - 1;

  -- Get available IPM from defense table
  SELECT COALESCE(pd.quantity, 0) INTO v_available_missiles
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = p_origin_planet_id AND dt.code = 'interplanetary_missile';

  v_available_missiles := COALESCE(v_available_missiles, 0);

  IF v_available_missiles < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes misiles interplanetarios');
  END IF;

  IF v_available_missiles < p_missile_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Solo tienes %s misiles interplanetarios disponibles', v_available_missiles)
    );
  END IF;

  -- Missiles can only hit targets in same galaxy
  IF v_origin_planet.galaxy != p_target_galaxy THEN
    RETURN jsonb_build_object('success', false, 'error', 'Los misiles solo pueden alcanzar objetivos en la misma galaxia');
  END IF;

  -- Calculate distance in solar systems
  v_actual_distance := ABS(v_origin_planet.solar_system - p_target_system);

  IF v_actual_distance > v_max_range THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', format('Objetivo fuera de alcance. Motor de Impulso nivel %s permite %s sistemas. Distancia: %s sistemas.', 
        v_impulse_level, v_max_range, v_actual_distance)
    );
  END IF;

  -- Get target planet
  SELECT p.* INTO v_target_planet
  FROM planets p
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay planeta en esas coordenadas');
  END IF;

  -- Cannot attack own planets
  IF v_target_planet.user_id = v_attacker_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No puedes atacar tus propios planetas');
  END IF;

  -- Check if target is uncolonized
  IF v_target_planet.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'El planeta objetivo no esta colonizado');
  END IF;

  -- Check vacation mode
  SELECT * INTO v_target_owner FROM profiles WHERE id = v_target_planet.user_id;
  IF v_target_owner.vacation_mode = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'El jugador objetivo esta en modo vacaciones');
  END IF;

  -- Get defender's ABM count
  SELECT COALESCE(pd.quantity, 0) INTO v_abm_count
  FROM planet_defenses pd
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE pd.planet_id = v_target_planet.id AND dt.code = 'anti_ballistic_missile';

  v_abm_count := COALESCE(v_abm_count, 0);

  -- ABM intercepts IPM at 1:1 ratio
  v_effective_missiles := GREATEST(0, p_missile_count - v_abm_count);

  -- Deduct IPM from attacker
  UPDATE planet_defenses pd
  SET quantity = quantity - p_missile_count
  FROM defense_types dt
  WHERE pd.defense_type_id = dt.id 
    AND pd.planet_id = p_origin_planet_id 
    AND dt.code = 'interplanetary_missile';

  -- Deduct ABMs from defender (consumed when intercepting)
  IF v_abm_count > 0 THEN
    UPDATE planet_defenses pd
    SET quantity = GREATEST(0, quantity - LEAST(p_missile_count, v_abm_count))
    FROM defense_types dt
    WHERE pd.defense_type_id = dt.id 
      AND pd.planet_id = v_target_planet.id 
      AND dt.code = 'anti_ballistic_missile';
  END IF;

  -- Calculate total damage from effective missiles
  IF v_effective_missiles > 0 THEN
    v_remaining_damage := v_effective_missiles * v_ipm_damage_per_missile;

    -- Destroy defenses: primary target first, then weakest to strongest
    -- Exclude ABM and IPM from destruction targets
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
      IF v_remaining_damage <= 0 THEN 
        EXIT; 
      END IF;

      -- Calculate how many units can be destroyed
      -- Each unit requires (structural_integrity) damage to destroy
      v_defense_destroyed := LEAST(
        v_defense_record.quantity,
        FLOOR(v_remaining_damage::numeric / GREATEST(1, v_defense_record.structural_integrity))::integer
      );

      IF v_defense_destroyed > 0 THEN
        -- Subtract damage used
        v_remaining_damage := v_remaining_damage - (v_defense_destroyed * v_defense_record.structural_integrity);

        -- Destroy the defenses
        UPDATE planet_defenses 
        SET quantity = quantity - v_defense_destroyed 
        WHERE id = v_defense_record.id;

        -- Record destroyed defenses
        v_destroyed_defenses := v_destroyed_defenses || jsonb_build_object(
          'name', v_defense_record.name,
          'code', v_defense_record.code,
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
    'Ataque de Misiles Interplanetarios',
    format(E'Tu planeta %s en [%s:%s:%s] ha sido atacado con misiles interplanetarios.\n\nMisiles recibidos: %s\nMisiles interceptados: %s\nMisiles impactados: %s\n\nDefensas destruidas:\n%s',
      v_target_planet.name, 
      p_target_galaxy, p_target_system, p_target_position,
      p_missile_count, 
      LEAST(v_abm_count, p_missile_count),
      v_effective_missiles,
      CASE WHEN jsonb_array_length(v_destroyed_defenses) > 0 
        THEN (SELECT string_agg(format('- %s x%s', elem->>'name', elem->>'quantity'), E'\n') 
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
    v_attacker_id,
    'Informe de Ataque de Misiles',
    format(E'Has lanzado misiles interplanetarios a [%s:%s:%s].\n\nMisiles lanzados: %s\nMisiles interceptados: %s\nMisiles efectivos: %s\n\nDefensas destruidas:\n%s',
      p_target_galaxy, p_target_system, p_target_position,
      p_missile_count,
      LEAST(v_abm_count, p_missile_count),
      v_effective_missiles,
      CASE WHEN jsonb_array_length(v_destroyed_defenses) > 0 
        THEN (SELECT string_agg(format('- %s x%s', elem->>'name', elem->>'quantity'), E'\n') 
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
    'total_damage', v_effective_missiles * v_ipm_damage_per_missile,
    'destroyed_defenses', v_destroyed_defenses,
    'impulse_level', v_impulse_level,
    'max_range', v_max_range
  );
END;
$$;

-- Update get_missile_silo_capacity to include range info
CREATE OR REPLACE FUNCTION get_missile_silo_capacity(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet record;
  v_silo_level integer;
  v_impulse_level integer;
  v_ipm_type_id integer;
  v_abm_type_id integer;
  v_ipm_count integer;
  v_abm_count integer;
  v_max_missiles integer;
  v_max_range integer;
BEGIN
  -- Get planet owner
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Planet not found');
  END IF;

  -- Get silo level
  SELECT COALESCE(pb.level, 0) INTO v_silo_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'missile_silo';

  v_silo_level := COALESCE(v_silo_level, 0);

  -- Max missiles = silo_level * 10
  v_max_missiles := v_silo_level * 10;

  -- Get impulse drive level for range calculation
  SELECT COALESCE(ut.level, 0) INTO v_impulse_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = v_planet.user_id AND tt.code = 'impulse_drive';

  v_impulse_level := COALESCE(v_impulse_level, 0);

  -- Range = (impulse_level * 5) - 1, minimum 0
  v_max_range := GREATEST(0, (v_impulse_level * 5) - 1);

  -- Get missile type IDs
  SELECT id INTO v_ipm_type_id FROM defense_types WHERE code = 'interplanetary_missile';
  SELECT id INTO v_abm_type_id FROM defense_types WHERE code = 'anti_ballistic_missile';

  -- Get current counts
  SELECT COALESCE(quantity, 0) INTO v_ipm_count
  FROM planet_defenses WHERE planet_id = p_planet_id AND defense_type_id = v_ipm_type_id;

  SELECT COALESCE(quantity, 0) INTO v_abm_count
  FROM planet_defenses WHERE planet_id = p_planet_id AND defense_type_id = v_abm_type_id;

  RETURN jsonb_build_object(
    'silo_level', v_silo_level,
    'max_missiles', v_max_missiles,
    'ipm_count', COALESCE(v_ipm_count, 0),
    'abm_count', COALESCE(v_abm_count, 0),
    'available_slots', GREATEST(0, v_max_missiles - COALESCE(v_ipm_count, 0) - COALESCE(v_abm_count, 0)),
    'impulse_level', v_impulse_level,
    'max_range', v_max_range,
    'can_launch', v_silo_level >= 4 AND v_impulse_level >= 1
  );
END;
$$;

-- Function to calculate missile range for display
CREATE OR REPLACE FUNCTION calculate_missile_range(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_impulse_level integer;
  v_max_range integer;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_impulse_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'impulse_drive';

  v_impulse_level := COALESCE(v_impulse_level, 0);
  v_max_range := GREATEST(0, (v_impulse_level * 5) - 1);

  RETURN jsonb_build_object(
    'impulse_level', v_impulse_level,
    'range_systems', v_max_range
  );
END;
$$;
