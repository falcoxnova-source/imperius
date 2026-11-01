/*
  # Fix: Moon logic to match OGame

  FIX 1: Allow storage buildings on moons
    - Remove metal_storage, crystal_storage, deuterium_tank from planet-only list

  FIX 2: Moons start with 1 field (OGame authentic)
    - Recreate check_moon_creation with fields_max = 1
    - Fix existing moons: set fields_max = 1 + (lunar_base_level * 3)
*/

-- ==========================================================================
-- FIX 1: Allow storage buildings on moons
-- ==========================================================================
CREATE OR REPLACE FUNCTION get_planet_only_buildings()
RETURNS text[] AS $$
BEGIN
  RETURN ARRAY['terraformer', 'metal_mine', 'crystal_mine', 'deuterium_synthesizer', 'solar_plant', 'fusion_reactor', 'research_lab', 'missile_silo'];
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public;

-- ==========================================================================
-- FIX 2: Moons start with 1 field, only Lunar Base adds more (+3/level)
-- ==========================================================================
CREATE OR REPLACE FUNCTION check_moon_creation(
  p_galaxy integer,
  p_system integer,
  p_position integer,
  p_debris_metal numeric,
  p_debris_crystal numeric
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_debris numeric;
  v_moon_chance numeric;
  v_existing_moon record;
  v_planet record;
  v_moon_created boolean := false;
  v_moon_diameter integer;
  v_new_moon_id uuid;
BEGIN
  SELECT * INTO v_existing_moon
  FROM planets
  WHERE galaxy = p_galaxy
    AND solar_system = p_system
    AND position = p_position
    AND planet_type = 'moon';

  IF FOUND THEN
    RETURN jsonb_build_object('moon_created', false, 'reason', 'Ya existe una luna');
  END IF;

  SELECT * INTO v_planet
  FROM planets
  WHERE galaxy = p_galaxy
    AND solar_system = p_system
    AND position = p_position
    AND planet_type = 'planet'
    AND user_id IS NOT NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('moon_created', false, 'reason', 'No hay planeta');
  END IF;

  v_total_debris := p_debris_metal + p_debris_crystal;
  v_moon_chance := LEAST(20, v_total_debris / 100000);

  IF random() * 100 < v_moon_chance THEN
    v_moon_created := true;

    v_moon_diameter := LEAST(8944, GREATEST(3474, 3474 + floor(v_total_debris / 50000) * 100));

    INSERT INTO planets (
      user_id, name, galaxy, solar_system, position,
      planet_type, diameter, temp_min, temp_max,
      fields_max, is_main_planet
    ) VALUES (
      v_planet.user_id, 'Luna', p_galaxy, p_system, p_position,
      'moon', v_moon_diameter, -40, -20,
      1, false
    )
    RETURNING id INTO v_new_moon_id;

    INSERT INTO planet_resources (planet_id, metal, crystal, deuterium)
    VALUES (v_new_moon_id, 0, 0, 0);

    INSERT INTO messages (sender_id, recipient_id, subject, body, message_type)
    VALUES (
      NULL, v_planet.user_id,
      'Una Luna ha aparecido!',
      format('Los escombros de la batalla en [%s:%s:%s] se han fusionado y han formado una luna con un diametro de %s km!',
        p_galaxy, p_system, p_position, v_moon_diameter),
      'system'
    );
  END IF;

  RETURN jsonb_build_object(
    'moon_created', v_moon_created,
    'moon_chance', v_moon_chance,
    'moon_diameter', CASE WHEN v_moon_created THEN v_moon_diameter ELSE NULL END,
    'total_debris', v_total_debris
  );
END;
$$;

-- ==========================================================================
-- FIX 3: Correct existing moons - set fields_max = 1 + (lunar_base * 3)
-- ==========================================================================
UPDATE planets p
SET fields_max = 1 + COALESCE((
  SELECT pb.level * 3
  FROM planet_buildings pb
  JOIN building_types bt ON bt.id = pb.building_type_id
  WHERE pb.planet_id = p.id AND bt.code = 'lunar_base'
), 0)
WHERE p.planet_type = 'moon';

-- ==========================================================================
-- FIX 4: process_building_queue_internal missing Lunar Base / Terraformer
--        fields_max increase. It only did fields_used += 1 but never
--        increased fields_max, so Lunar Base gave no extra fields.
-- ==========================================================================
CREATE OR REPLACE FUNCTION process_building_queue_internal(p_planet_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_queue_item RECORD;
  v_completed_count integer := 0;
  v_result jsonb;
  v_legacy_completed integer := 0;
  v_existing_building planet_buildings%ROWTYPE;
  v_levels_added integer;
  v_building_code text;
  v_fields_increase integer;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  UPDATE building_queue
  SET 
    start_time = COALESCE(start_time, NOW()),
    end_time = COALESCE(end_time, NOW() + (build_time || ' seconds')::interval)
  WHERE planet_id = p_planet_id
    AND queue_position = 1
    AND (start_time IS NULL OR end_time IS NULL);

  FOR v_queue_item IN 
    SELECT bq.*, bt.code as building_code
    FROM building_queue bq
    JOIN building_types bt ON bt.id = bq.building_type_id
    WHERE bq.planet_id = p_planet_id 
      AND bq.end_time IS NOT NULL 
      AND bq.end_time <= (NOW() + INTERVAL '2 seconds')
    ORDER BY bq.queue_position
  LOOP
    SELECT * INTO v_existing_building 
    FROM planet_buildings 
    WHERE planet_id = v_queue_item.planet_id AND building_type_id = v_queue_item.building_type_id;

    IF FOUND THEN
      v_levels_added := v_queue_item.target_level - v_existing_building.level;
      UPDATE planet_buildings 
      SET level = v_queue_item.target_level, is_upgrading = false, upgrade_end_time = NULL
      WHERE id = v_existing_building.id;
    ELSE
      v_levels_added := v_queue_item.target_level;
      INSERT INTO planet_buildings (planet_id, building_type_id, level, is_upgrading)
      VALUES (v_queue_item.planet_id, v_queue_item.building_type_id, v_queue_item.target_level, false);
    END IF;

    -- Lunar Base: +3 fields_max per level | Terraformer: +5 fields_max per level
    IF v_queue_item.building_code = 'lunar_base' THEN
      v_fields_increase := v_levels_added * 3;
      UPDATE planets 
      SET fields_used = fields_used + v_levels_added,
          fields_max = fields_max + v_fields_increase
      WHERE id = v_queue_item.planet_id;
    ELSIF v_queue_item.building_code = 'terraformer' THEN
      v_fields_increase := v_levels_added * 5;
      UPDATE planets 
      SET fields_used = fields_used + v_levels_added,
          fields_max = fields_max + v_fields_increase
      WHERE id = v_queue_item.planet_id;
    ELSIF v_levels_added > 0 THEN
      UPDATE planets SET fields_used = fields_used + v_levels_added WHERE id = v_queue_item.planet_id;
    END IF;

    DELETE FROM building_queue WHERE id = v_queue_item.id;
    v_completed_count := v_completed_count + 1;
  END LOOP;

  WITH reordered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY queue_position) as new_pos
    FROM building_queue
    WHERE planet_id = p_planet_id
  )
  UPDATE building_queue bq
  SET 
    queue_position = r.new_pos,
    start_time = CASE WHEN r.new_pos = 1 THEN COALESCE(bq.start_time, NOW()) ELSE bq.start_time END,
    end_time = CASE WHEN r.new_pos = 1 THEN COALESCE(bq.end_time, NOW() + (bq.build_time || ' seconds')::interval) ELSE bq.end_time END
  FROM reordered r
  WHERE bq.id = r.id;

  SELECT COUNT(*) INTO v_legacy_completed
  FROM planet_buildings
  WHERE planet_id = p_planet_id
    AND is_upgrading = true
    AND upgrade_end_time IS NOT NULL
    AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');

  IF v_legacy_completed > 0 THEN
    UPDATE planets 
    SET fields_used = fields_used + v_legacy_completed 
    WHERE id = p_planet_id;
    
    UPDATE planet_buildings
    SET level = level + 1, is_upgrading = false, upgrade_end_time = NULL
    WHERE planet_id = p_planet_id
      AND is_upgrading = true
      AND upgrade_end_time IS NOT NULL
      AND upgrade_end_time <= (NOW() + INTERVAL '2 seconds');
  END IF;

  RETURN jsonb_build_object('success', true, 'completed_count', v_completed_count + v_legacy_completed);
END;
$$;
