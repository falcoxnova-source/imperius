-- =====================================================================
-- SISTEMA DE MISIONES DIARIAS
-- Misiónes rotativas con bonos temporales (no rompe economía)
-- =====================================================================

CREATE TABLE IF NOT EXISTS daily_missions (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,
  mission_type text NOT NULL CHECK (mission_type IN ('attack','spy','expedition','build','research','collect_metal','collect_crystal','collect_deuterium')),
  target_count integer NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('production_bonus','speed_bonus')),
  reward_value numeric NOT NULL DEFAULT 20,
  reward_duration_hours integer NOT NULL DEFAULT 24,
  title_es text NOT NULL,
  desc_es text NOT NULL,
  icon text NOT NULL DEFAULT 'Sword',
  is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS user_daily_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id integer NOT NULL REFERENCES daily_missions(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  claimed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mission_id, expires_at)
);

CREATE TABLE IF NOT EXISTS user_active_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mission_id integer REFERENCES daily_missions(id) ON DELETE SET NULL,
  bonus_type text NOT NULL CHECK (bonus_type IN ('production_bonus','speed_bonus')),
  bonus_value numeric NOT NULL DEFAULT 20,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_active_bonuses_user ON user_active_bonuses(user_id);

-- Assign 3 random daily missions to a user
CREATE OR REPLACE FUNCTION assign_daily_missions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := current_date;
  v_count integer;
  v_missions integer[];
  v_mid integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM user_daily_missions
  WHERE user_id = p_user_id AND expires_at::date = v_today AND expires_at > now();

  IF v_count >= 3 THEN
    RETURN jsonb_build_object('success', true, 'count', v_count, 'message', 'Ya tienes misiones asignadas hoy');
  END IF;

  SELECT ARRAY_AGG(id) INTO v_missions
  FROM (
    SELECT id FROM daily_missions WHERE is_active = true
    ORDER BY random()
    LIMIT (3 - v_count)
  ) sub;

  IF v_missions IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No hay misiones activas');
  END IF;

  FOREACH v_mid IN ARRAY v_missions
  LOOP
    INSERT INTO user_daily_missions (user_id, mission_id, progress, expires_at)
    VALUES (p_user_id, v_mid, 0, (v_today + interval '1 day')::date)
    ON CONFLICT (user_id, mission_id, expires_at) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count + array_length(v_missions, 1));
END;
$$;

-- Update progress for a specific mission type
CREATE OR REPLACE FUNCTION update_daily_mission_progress(
  p_user_id uuid,
  p_mission_type text,
  p_amount integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_daily_missions
  SET progress = LEAST(dm.target_count, progress + p_amount),
      completed = (progress + p_amount >= dm.target_count)
  FROM daily_missions dm
  WHERE user_daily_missions.mission_id = dm.id
    AND user_daily_missions.user_id = p_user_id
    AND dm.mission_type = p_mission_type
    AND user_daily_missions.completed = false
    AND user_daily_missions.claimed = false
    AND user_daily_missions.expires_at > now();
END;
$$;

-- Claim a completed mission reward
CREATE OR REPLACE FUNCTION claim_daily_mission_reward(
  p_user_id uuid,
  p_mission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record;
  v_bonus_id uuid;
BEGIN
  SELECT udm.*, dm.reward_type, dm.reward_value, dm.reward_duration_hours, dm.code
  INTO v_mission
  FROM user_daily_missions udm
  JOIN daily_missions dm ON dm.id = udm.mission_id
  WHERE udm.id = p_mission_id AND udm.user_id = p_user_id
    AND udm.completed = true AND udm.claimed = false
    AND udm.expires_at > now()
  FOR UPDATE OF udm;

  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mision no disponible o ya reclamada');
  END IF;

  UPDATE user_daily_missions SET claimed = true WHERE id = p_mission_id;

  INSERT INTO user_active_bonuses (user_id, mission_id, bonus_type, bonus_value, expires_at)
  VALUES (p_user_id, v_mission.mission_id, v_mission.reward_type, v_mission.reward_value, now() + (v_mission.reward_duration_hours || ' hours')::interval);

  RETURN jsonb_build_object(
    'success', true,
    'bonus_type', v_mission.reward_type,
    'bonus_value', v_mission.reward_value,
    'expires_at', now() + (v_mission.reward_duration_hours || ' hours')::interval
  );
END;
$$;

-- Get user's current daily missions
CREATE OR REPLACE FUNCTION get_user_daily_missions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assign_daily_missions(p_user_id);

  SELECT jsonb_agg(jsonb_build_object(
    'id', udm.id,
    'mission_id', dm.id,
    'code', dm.code,
    'title', dm.title_es,
    'description', dm.desc_es,
    'mission_type', dm.mission_type,
    'target_count', dm.target_count,
    'progress', udm.progress,
    'completed', udm.completed,
    'claimed', udm.claimed,
    'reward_type', dm.reward_type,
    'reward_value', dm.reward_value,
    'reward_duration_hours', dm.reward_duration_hours,
    'icon', dm.icon,
    'expires_at', udm.expires_at
  ) ORDER BY udm.completed ASC, udm.claimed ASC, dm.id)
  INTO v_result
  FROM user_daily_missions udm
  JOIN daily_missions dm ON dm.id = udm.mission_id
  WHERE udm.user_id = p_user_id AND udm.expires_at > now();

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Get user's active production bonus
CREATE OR REPLACE FUNCTION get_user_daily_mission_production_bonus(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric := 0;
BEGIN
  SELECT COALESCE(SUM(bonus_value), 0) INTO v_bonus
  FROM user_active_bonuses
  WHERE user_id = p_user_id
    AND bonus_type = 'production_bonus'
    AND expires_at > now();
  RETURN v_bonus / 100.0;
END;
$$;

-- =====================================================================
-- TRIGGERS para tracking automatico de progreso
-- =====================================================================

-- 1. Detectar misiones de flota completadas (attack / spy / expedition)
CREATE OR REPLACE FUNCTION trg_fleet_completed_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_completed = true AND (OLD.is_completed = false OR OLD.is_completed IS NULL) THEN
    -- Attack missions
    IF NEW.mission_type = 'attack' THEN
      PERFORM update_daily_mission_progress(NEW.user_id, 'attack', 1);
    -- Espionage missions
    ELSIF NEW.mission_type = 'espionage' THEN
      PERFORM update_daily_mission_progress(NEW.user_id, 'spy', 1);
    -- Expedition missions
    ELSIF NEW.mission_type = 'expedition' THEN
      PERFORM update_daily_mission_progress(NEW.user_id, 'expedition', 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fleet_completed_daily_mission ON fleets;
CREATE TRIGGER trg_fleet_completed_daily_mission
  AFTER UPDATE OF is_completed ON fleets
  FOR EACH ROW
  EXECUTE FUNCTION trg_fleet_completed_daily_mission();

-- 2. Detectar construcciones completadas
CREATE OR REPLACE FUNCTION trg_building_completed_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.level > OLD.level THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
    IF v_user_id IS NOT NULL THEN
      PERFORM update_daily_mission_progress(v_user_id, 'build', NEW.level - OLD.level);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_building_completed_daily_mission ON planet_buildings;
CREATE TRIGGER trg_building_completed_daily_mission
  AFTER UPDATE OF level ON planet_buildings
  FOR EACH ROW
  WHEN (NEW.level > OLD.level)
  EXECUTE FUNCTION trg_building_completed_daily_mission();

-- 3. Detectar investigaciones completadas
CREATE OR REPLACE FUNCTION trg_research_completed_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.level > OLD.level AND NEW.is_researching = false THEN
    PERFORM update_daily_mission_progress(NEW.user_id, 'research', NEW.level - OLD.level);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_research_completed_daily_mission ON user_technologies;
CREATE TRIGGER trg_research_completed_daily_mission
  AFTER UPDATE OF level, is_researching ON user_technologies
  FOR EACH ROW
  WHEN (NEW.level > OLD.level AND NEW.is_researching = false)
  EXECUTE FUNCTION trg_research_completed_daily_mission();

-- 4. Detectar recoleccion de recursos (cada sync escribe nuevos valores)
CREATE OR REPLACE FUNCTION trg_resource_collect_daily_mission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_metal_diff numeric;
  v_crystal_diff numeric;
  v_deuterium_diff numeric;
BEGIN
  IF NEW.last_update > OLD.last_update THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    v_metal_diff := GREATEST(0, NEW.metal - OLD.metal);
    v_crystal_diff := GREATEST(0, NEW.crystal - OLD.crystal);
    v_deuterium_diff := GREATEST(0, NEW.deuterium - OLD.deuterium);

    IF v_metal_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_metal', v_metal_diff::integer);
    END IF;
    IF v_crystal_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_crystal', v_crystal_diff::integer);
    END IF;
    IF v_deuterium_diff > 0 THEN
      PERFORM update_daily_mission_progress(v_user_id, 'collect_deuterium', v_deuterium_diff::integer);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- NOTE: Planet resources trigger only added if table supports it
-- Check if column exists first to avoid errors
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'planet_resources' AND column_name = 'last_update') THEN
    DROP TRIGGER IF EXISTS trg_resource_collect_daily_mission ON planet_resources;
    CREATE TRIGGER trg_resource_collect_daily_mission
      AFTER UPDATE OF metal, crystal, deuterium, last_update ON planet_resources
      FOR EACH ROW
      WHEN (NEW.last_update > OLD.last_update)
      EXECUTE FUNCTION trg_resource_collect_daily_mission();
  END IF;
END;
$$;

-- =====================================================================
-- SEED DATA: 12 missiones variadas
-- =====================================================================
INSERT INTO daily_missions (code, mission_type, target_count, reward_type, reward_value, reward_duration_hours, title_es, desc_es, icon)
VALUES
  ('destroy_3', 'attack', 3, 'production_bonus', 20, 24, 'Conquista 3 Batallas', 'Gana 3 batallas ofensivas hoy y aumenta tu produccion un 20% por 24h', 'Sword'),
  ('destroy_5', 'attack', 5, 'speed_bonus', 25, 12, 'Guerrero Implacable', 'Gana 5 batallas para acelerar construcciones un 25% durante 12h', 'Sword'),
  ('spy_3', 'spy', 3, 'production_bonus', 15, 24, 'Ojos en Todas Partes', 'Espia 3 planetas enemigos y mejora tu produccion un 15%', 'Eye'),
  ('spy_5', 'spy', 5, 'speed_bonus', 20, 12, 'Maestro del Espionaje', 'Realiza 5 misiones de espionaje para acelerar investigaciones', 'Eye'),
  ('expedition_2', 'expedition', 2, 'production_bonus', 25, 24, 'Explorador Estelar', 'Completa 2 expediciones y potencia tu economia un 25%', 'Compass'),
  ('expedition_4', 'expedition', 4, 'speed_bonus', 30, 12, 'Conquistador del Universo', '4 expediciones para obtener un 30% de velocidad en todo', 'Compass'),
  ('build_3', 'build', 3, 'production_bonus', 15, 24, 'Arquitecto Galactico', 'Construye 3 niveles de edificios y mejora tu produccion', 'Building2'),
  ('build_5', 'build', 5, 'speed_bonus', 20, 12, 'Constructo Imparable', '5 niveles de edificios para acelerar tu imperio', 'Building2'),
  ('research_2', 'research', 2, 'production_bonus', 20, 24, 'Cientifico Estelar', 'Completa 2 investigaciones para mejorar tu produccion', 'Microscope'),
  ('research_3', 'research', 3, 'speed_bonus', 25, 12, 'Mente Brillante', '3 investigaciones para acelerar tu progreso tecnologico', 'Microscope'),
  ('collect_metal_500k', 'collect_metal', 500000, 'speed_bonus', 15, 24, 'Minero Incansable', 'Extrae 500k de metal para obtener velocidad de construccion', 'Pickaxe'),
  ('collect_crystal_250k', 'collect_crystal', 250000, 'production_bonus', 20, 24, 'Cazador de Cristal', 'Acumula 250k de cristal y potencia tus minas un 20%', 'Gem')
ON CONFLICT (code) DO NOTHING;

GRANT EXECUTE ON FUNCTION assign_daily_missions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_daily_mission_progress(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_daily_mission_reward(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_daily_missions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_daily_mission_production_bonus(uuid) TO authenticated;
