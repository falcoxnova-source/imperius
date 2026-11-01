/*
  # Points Calculation System

  1. Overview
    - Implements XNova/OGame standard points calculation
    - Points = Total resources spent / 1000
    - Separate tracking for buildings, research, fleet, defense

  2. Functions Created
    - calculate_building_points: Sum of all building costs for a user
    - calculate_research_points: Sum of all research costs for a user
    - calculate_fleet_points: Sum of all ship costs for a user
    - calculate_defense_points: Sum of all defense costs for a user
    - update_player_points: Main function to recalculate all points
    - recalculate_all_player_points: Batch recalculation for all players

  3. Triggers
    - After INSERT/UPDATE/DELETE on planet_buildings
    - After INSERT/UPDATE/DELETE on user_technologies
    - After INSERT/UPDATE/DELETE on planet_ships
    - After INSERT/UPDATE/DELETE on planet_defenses

  4. Formula Details
    - Building level L cost = base_cost * factor^(L-1)
    - Total building points = sum of costs for all levels / 1000
    - Ship/Defense points = unit_cost * quantity / 1000
*/

-- Function to calculate total resources spent on buildings for all levels
-- Uses geometric series formula: sum = base * (1 - r^n) / (1 - r)
CREATE OR REPLACE FUNCTION calculate_building_total_cost(
  p_base_metal integer,
  p_base_crystal integer,
  p_base_deuterium integer,
  p_cost_factor numeric,
  p_level integer
) RETURNS bigint AS $$
DECLARE
  v_total_metal bigint := 0;
  v_total_crystal bigint := 0;
  v_total_deuterium bigint := 0;
  i integer;
BEGIN
  IF p_level <= 0 THEN
    RETURN 0;
  END IF;
  
  FOR i IN 0..(p_level - 1) LOOP
    v_total_metal := v_total_metal + floor(p_base_metal * power(p_cost_factor, i));
    v_total_crystal := v_total_crystal + floor(p_base_crystal * power(p_cost_factor, i));
    v_total_deuterium := v_total_deuterium + floor(p_base_deuterium * power(p_cost_factor, i));
  END LOOP;
  
  RETURN v_total_metal + v_total_crystal + v_total_deuterium;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate building points for a user (all planets)
CREATE OR REPLACE FUNCTION calculate_building_points(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_total_cost bigint := 0;
  v_record record;
BEGIN
  FOR v_record IN
    SELECT 
      bt.base_metal,
      bt.base_crystal,
      bt.base_deuterium,
      bt.cost_factor,
      pb.level
    FROM planet_buildings pb
    JOIN planets p ON pb.planet_id = p.id
    JOIN building_types bt ON pb.building_type_id = bt.id
    WHERE p.user_id = p_user_id AND pb.level > 0
  LOOP
    v_total_cost := v_total_cost + calculate_building_total_cost(
      v_record.base_metal,
      v_record.base_crystal,
      v_record.base_deuterium,
      v_record.cost_factor::numeric,
      v_record.level
    );
  END LOOP;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate research points for a user
CREATE OR REPLACE FUNCTION calculate_research_points(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_total_cost bigint := 0;
  v_record record;
BEGIN
  FOR v_record IN
    SELECT 
      tt.base_metal,
      tt.base_crystal,
      tt.base_deuterium,
      tt.cost_factor,
      ut.level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND ut.level > 0
  LOOP
    v_total_cost := v_total_cost + calculate_building_total_cost(
      v_record.base_metal,
      v_record.base_crystal,
      v_record.base_deuterium,
      v_record.cost_factor::numeric,
      v_record.level
    );
  END LOOP;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate fleet points for a user (all planets)
CREATE OR REPLACE FUNCTION calculate_fleet_points(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_total_cost bigint := 0;
BEGIN
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * ps.quantity
  ), 0) INTO v_total_cost
  FROM planet_ships ps
  JOIN planets p ON ps.planet_id = p.id
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE p.user_id = p_user_id AND ps.quantity > 0;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$ LANGUAGE plpgsql STABLE;

-- Calculate defense points for a user (all planets)
CREATE OR REPLACE FUNCTION calculate_defense_points(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_total_cost bigint := 0;
BEGIN
  SELECT COALESCE(SUM(
    (dt.metal_cost + dt.crystal_cost + dt.deuterium_cost)::bigint * pd.quantity
  ), 0) INTO v_total_cost
  FROM planet_defenses pd
  JOIN planets p ON pd.planet_id = p.id
  JOIN defense_types dt ON pd.defense_type_id = dt.id
  WHERE p.user_id = p_user_id AND pd.quantity > 0;
  
  RETURN floor(v_total_cost / 1000)::integer;
END;
$$ LANGUAGE plpgsql STABLE;

-- Main function to update all points for a user
CREATE OR REPLACE FUNCTION update_player_points(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_buildings integer;
  v_research integer;
  v_fleet integer;
  v_defense integer;
BEGIN
  v_buildings := calculate_building_points(p_user_id);
  v_research := calculate_research_points(p_user_id);
  v_fleet := calculate_fleet_points(p_user_id);
  v_defense := calculate_defense_points(p_user_id);
  
  UPDATE profiles SET
    points_buildings = v_buildings,
    points_research = v_research,
    points_fleet = v_fleet,
    points_defense = v_defense,
    points_total = v_buildings + v_research + v_fleet + v_defense,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for buildings changes
CREATE OR REPLACE FUNCTION trigger_update_building_points()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for research changes
CREATE OR REPLACE FUNCTION trigger_update_research_points()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM update_player_points(OLD.user_id);
  ELSE
    PERFORM update_player_points(NEW.user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for ships changes
CREATE OR REPLACE FUNCTION trigger_update_fleet_points()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for defenses changes
CREATE OR REPLACE FUNCTION trigger_update_defense_points()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM planets WHERE id = OLD.planet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM planets WHERE id = NEW.planet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM update_player_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trigger_building_points ON planet_buildings;
CREATE TRIGGER trigger_building_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_buildings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_building_points();

DROP TRIGGER IF EXISTS trigger_research_points ON user_technologies;
CREATE TRIGGER trigger_research_points
  AFTER INSERT OR UPDATE OR DELETE ON user_technologies
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_research_points();

DROP TRIGGER IF EXISTS trigger_fleet_points ON planet_ships;
CREATE TRIGGER trigger_fleet_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_ships
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_fleet_points();

DROP TRIGGER IF EXISTS trigger_defense_points ON planet_defenses;
CREATE TRIGGER trigger_defense_points
  AFTER INSERT OR UPDATE OR DELETE ON planet_defenses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_defense_points();

-- Function to recalculate points for all players (for maintenance)
CREATE OR REPLACE FUNCTION recalculate_all_player_points()
RETURNS void AS $$
DECLARE
  v_user record;
BEGIN
  FOR v_user IN SELECT id FROM profiles LOOP
    PERFORM update_player_points(v_user.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run initial calculation for all existing players
SELECT recalculate_all_player_points();
