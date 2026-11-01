/*
  # XNova Features Complete

  1. New Features
    - Noob protection validation function
    - IRN (Intergalactic Research Network) level calculation
    - Moon creation from battle debris
    - Terraformer field calculation
    - ACS (Alliance Combat System) support tables

  2. New Tables
    - `acs_fleets` - Coordinated alliance attacks

  3. Functions
    - `check_noob_protection` - Validates if attack is allowed
    - `calculate_irn_lab_level` - Calculates effective lab level with IRN
    - `create_moon_from_battle` - Creates moon after battle with chance
    - `calculate_planet_max_fields` - Calculates max fields including terraformer
    - `validate_fleet_mission` - Server-side fleet validation
*/

-- Function to check noob protection
CREATE OR REPLACE FUNCTION check_noob_protection(
  p_attacker_id uuid,
  p_defender_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_attacker_points integer;
  v_defender_points integer;
  v_noob_limit integer;
  v_attacker_vacation boolean;
  v_defender_vacation boolean;
BEGIN
  SELECT points_total, vacation_mode INTO v_attacker_points, v_attacker_vacation
  FROM profiles WHERE id = p_attacker_id;

  SELECT points_total, vacation_mode INTO v_defender_points, v_defender_vacation
  FROM profiles WHERE id = p_defender_id;

  SELECT value::integer INTO v_noob_limit
  FROM game_settings WHERE key = 'newbie_protection_points';

  IF v_noob_limit IS NULL THEN
    v_noob_limit := 5000;
  END IF;

  IF v_attacker_vacation THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'No puedes atacar en modo vacaciones'
    );
  END IF;

  IF v_defender_vacation THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador esta en modo vacaciones'
    );
  END IF;

  IF v_defender_points <= v_noob_limit AND v_attacker_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador esta bajo proteccion de novatos'
    );
  END IF;

  IF v_attacker_points > v_defender_points * 5 AND v_defender_points > 0 THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado debil (ratio 5:1)'
    );
  END IF;

  IF v_defender_points > v_attacker_points * 5 AND v_defender_points > v_noob_limit THEN
    RETURN jsonb_build_object(
      'can_attack', false,
      'reason', 'El jugador es demasiado fuerte (ratio 1:5)'
    );
  END IF;

  RETURN jsonb_build_object('can_attack', true, 'reason', null);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate IRN effective lab level
CREATE OR REPLACE FUNCTION calculate_irn_lab_level(
  p_user_id uuid,
  p_current_planet_id uuid
) RETURNS integer AS $$
DECLARE
  v_irn_level integer;
  v_current_lab_level integer;
  v_other_labs integer[];
  v_bonus_levels integer := 0;
  v_lab_level integer;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(ut.level, 0) INTO v_irn_level
  FROM user_technologies ut
  JOIN technology_types tt ON ut.technology_type_id = tt.id
  WHERE ut.user_id = p_user_id AND tt.code = 'intergalactic_research_network';

  SELECT COALESCE(pb.level, 0) INTO v_current_lab_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_current_planet_id AND bt.code = 'research_lab';

  IF v_irn_level = 0 THEN
    RETURN v_current_lab_level;
  END IF;

  SELECT ARRAY_AGG(pb.level ORDER BY pb.level DESC) INTO v_other_labs
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  JOIN planets p ON pb.planet_id = p.id
  WHERE p.user_id = p_user_id
    AND pb.planet_id != p_current_planet_id
    AND bt.code = 'research_lab'
    AND pb.level > 0;

  IF v_other_labs IS NULL OR array_length(v_other_labs, 1) IS NULL THEN
    RETURN v_current_lab_level;
  END IF;

  FOREACH v_lab_level IN ARRAY v_other_labs LOOP
    IF v_count < v_irn_level THEN
      v_bonus_levels := v_bonus_levels + v_lab_level;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_current_lab_level + v_bonus_levels;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create moon from battle
CREATE OR REPLACE FUNCTION create_moon_from_battle(
  p_planet_id uuid,
  p_debris_metal numeric,
  p_debris_crystal numeric
) RETURNS uuid AS $$
DECLARE
  v_total_debris numeric;
  v_moon_chance integer;
  v_random_roll integer;
  v_moon_diameter integer;
  v_moon_fields integer;
  v_planet record;
  v_existing_moon uuid;
  v_new_moon_id uuid;
BEGIN
  SELECT id INTO v_existing_moon
  FROM planets
  WHERE galaxy = (SELECT galaxy FROM planets WHERE id = p_planet_id)
    AND solar_system = (SELECT solar_system FROM planets WHERE id = p_planet_id)
    AND position = (SELECT position FROM planets WHERE id = p_planet_id)
    AND planet_type = 'moon';

  IF v_existing_moon IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_total_debris := COALESCE(p_debris_metal, 0) + COALESCE(p_debris_crystal, 0);
  v_moon_chance := LEAST(20, GREATEST(0, FLOOR(v_total_debris / 100000)::integer));

  IF v_moon_chance < 1 THEN
    RETURN NULL;
  END IF;

  v_random_roll := FLOOR(RANDOM() * 100)::integer + 1;

  IF v_random_roll > v_moon_chance THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;

  v_moon_diameter := 8000 + (v_moon_chance * 100) + FLOOR(RANDOM() * 1000)::integer;
  v_moon_fields := FLOOR(POWER(v_moon_diameter / 1000.0, 2) * 0.5)::integer;

  INSERT INTO planets (
    user_id, name, galaxy, solar_system, position,
    planet_type, diameter, fields_max, temp_min, temp_max
  ) VALUES (
    v_planet.user_id,
    'Luna',
    v_planet.galaxy,
    v_planet.solar_system,
    v_planet.position,
    'moon',
    v_moon_diameter,
    v_moon_fields,
    -40,
    -20
  ) RETURNING id INTO v_new_moon_id;

  INSERT INTO planet_resources (planet_id, metal, crystal, deuterium)
  VALUES (v_new_moon_id, 0, 0, 0);

  INSERT INTO messages (recipient_id, subject, body, message_type)
  VALUES (
    v_planet.user_id,
    'Nueva Luna Creada',
    'Los escombros de la batalla han formado una luna en las coordenadas [' ||
    v_planet.galaxy || ':' || v_planet.solar_system || ':' || v_planet.position ||
    ']. Diametro: ' || v_moon_diameter || ' km. Campos: ' || v_moon_fields,
    'system'
  );

  RETURN v_new_moon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate max fields with terraformer
CREATE OR REPLACE FUNCTION calculate_planet_max_fields(p_planet_id uuid)
RETURNS integer AS $$
DECLARE
  v_planet record;
  v_terraformer_level integer;
  v_base_fields integer;
  v_position_bonus integer;
BEGIN
  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id;

  IF v_planet.planet_type = 'moon' THEN
    RETURN v_planet.fields_max;
  END IF;

  SELECT COALESCE(pb.level, 0) INTO v_terraformer_level
  FROM planet_buildings pb
  JOIN building_types bt ON pb.building_type_id = bt.id
  WHERE pb.planet_id = p_planet_id AND bt.code = 'terraformer';

  v_base_fields := FLOOR(POWER(v_planet.diameter / 1000.0, 2))::integer;

  v_position_bonus := CASE v_planet.position
    WHEN 1 THEN -30
    WHEN 2 THEN -20
    WHEN 3 THEN -10
    WHEN 10 THEN 5
    WHEN 11 THEN 10
    WHEN 12 THEN 15
    WHEN 13 THEN 20
    WHEN 14 THEN 15
    WHEN 15 THEN 10
    ELSE 0
  END;

  RETURN GREATEST(40, v_base_fields + v_position_bonus + (v_terraformer_level * 5));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ACS (Alliance Combat System) table
CREATE TABLE IF NOT EXISTS acs_fleets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  main_fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES alliances(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'ACS Attack',
  target_galaxy integer NOT NULL,
  target_system integer NOT NULL,
  target_position integer NOT NULL,
  arrival_time timestamptz NOT NULL,
  max_fleets integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS acs_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acs_id uuid REFERENCES acs_fleets(id) ON DELETE CASCADE,
  fleet_id uuid REFERENCES fleets(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(acs_id, fleet_id)
);

ALTER TABLE acs_fleets ENABLE ROW LEVEL SECURITY;
ALTER TABLE acs_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ACS fleets they participate in"
  ON acs_fleets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM acs_participants
      WHERE acs_participants.acs_id = acs_fleets.id
      AND acs_participants.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM fleets
      WHERE fleets.id = acs_fleets.main_fleet_id
      AND fleets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create ACS fleets for their fleets"
  ON acs_fleets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fleets
      WHERE fleets.id = main_fleet_id
      AND fleets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their ACS participation"
  ON acs_participants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can join ACS"
  ON acs_participants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Function to validate fleet mission before sending
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_origin_planet_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
) RETURNS jsonb AS $$
DECLARE
  v_target_planet record;
  v_target_owner_id uuid;
  v_protection_check jsonb;
BEGIN
  SELECT p.*, pr.id as owner_id INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
    AND NOT p.is_destroyed;

  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'La posicion ya esta ocupada'
      );
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'Las expediciones deben ir a la posicion 16'
      );
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'No hay planeta en esas coordenadas'
      );
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'No puedes atacar tus propios planetas'
      );
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);

    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', v_protection_check->>'reason'
      );
    END IF;
  END IF;

  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'No hay planeta en esas coordenadas'
      );
    END IF;
  END IF;

  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object(
        'valid', false,
        'reason', 'No hay campo de escombros en esas coordenadas'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update planet max fields when terraformer is built
CREATE OR REPLACE FUNCTION update_planet_fields_on_terraformer()
RETURNS TRIGGER AS $$
DECLARE
  v_building_code text;
  v_new_max_fields integer;
BEGIN
  SELECT code INTO v_building_code
  FROM building_types WHERE id = NEW.building_type_id;

  IF v_building_code = 'terraformer' THEN
    v_new_max_fields := calculate_planet_max_fields(NEW.planet_id);

    UPDATE planets
    SET fields_max = v_new_max_fields
    WHERE id = NEW.planet_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_fields_on_terraformer ON planet_buildings;
CREATE TRIGGER trigger_update_fields_on_terraformer
  AFTER INSERT OR UPDATE ON planet_buildings
  FOR EACH ROW
  EXECUTE FUNCTION update_planet_fields_on_terraformer();

-- Add bashing_protection setting
INSERT INTO game_settings (key, value, description)
VALUES ('bashing_protection', 'true', 'Habilitar proteccion contra bashing (max 6 ataques/24h)')
ON CONFLICT (key) DO NOTHING;

-- Add max_acs_fleets setting
INSERT INTO game_settings (key, value, description)
VALUES ('max_acs_fleets', '5', 'Maximo de flotas en un ataque ACS')
ON CONFLICT (key) DO NOTHING;