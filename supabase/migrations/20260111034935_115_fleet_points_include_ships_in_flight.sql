/*
  # Fix Fleet Points Calculation - Include Ships in Flight

  1. Problem
    - Currently calculate_fleet_points only counts ships in planet_ships table
    - When player sends a fleet, ships are moved to fleet_ships table
    - This causes points to drop while fleet is in transit
    - In original XNova/OGame, points should remain while ships are flying

  2. Solution
    - Modify calculate_fleet_points to also count ships in fleet_ships table
    - Ships in flight still belong to the player and should count towards points
    - Points are only lost when ships are destroyed in battle

  3. Changes
    - Update calculate_fleet_points function to include:
      - Ships on planets (planet_ships)
      - Ships in flight (fleet_ships from active fleets owned by user)
*/

-- Update calculate_fleet_points to include ships in flight
CREATE OR REPLACE FUNCTION calculate_fleet_points(p_user_id uuid)
RETURNS integer AS $$
DECLARE
  v_planet_ships_cost bigint := 0;
  v_fleet_ships_cost bigint := 0;
BEGIN
  -- Ships stationed on planets
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * ps.quantity
  ), 0) INTO v_planet_ships_cost
  FROM planet_ships ps
  JOIN planets p ON ps.planet_id = p.id
  JOIN ship_types st ON ps.ship_type_id = st.id
  WHERE p.user_id = p_user_id AND ps.quantity > 0;
  
  -- Ships currently in flight (not completed fleets)
  SELECT COALESCE(SUM(
    (st.metal_cost + st.crystal_cost + st.deuterium_cost)::bigint * fs.quantity
  ), 0) INTO v_fleet_ships_cost
  FROM fleet_ships fs
  JOIN fleets f ON fs.fleet_id = f.id
  JOIN ship_types st ON fs.ship_type_id = st.id
  WHERE f.user_id = p_user_id 
    AND f.is_completed = false
    AND fs.quantity > 0;
  
  RETURN floor((v_planet_ships_cost + v_fleet_ships_cost) / 1000)::integer;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

-- Create trigger function to update points when fleets change
CREATE OR REPLACE FUNCTION trigger_update_fleet_points_on_fleet_change()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM update_user_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Create trigger function to update points when fleet_ships change
CREATE OR REPLACE FUNCTION trigger_update_fleet_points_on_fleet_ships_change()
RETURNS trigger AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO v_user_id FROM fleets WHERE id = OLD.fleet_id;
  ELSE
    SELECT user_id INTO v_user_id FROM fleets WHERE id = NEW.fleet_id;
  END IF;
  
  IF v_user_id IS NOT NULL THEN
    PERFORM update_user_points(v_user_id);
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Create trigger on fleets table
DROP TRIGGER IF EXISTS trigger_fleet_change_points ON fleets;
CREATE TRIGGER trigger_fleet_change_points
  AFTER INSERT OR UPDATE OF is_completed OR DELETE ON fleets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_fleet_points_on_fleet_change();

-- Create trigger on fleet_ships table
DROP TRIGGER IF EXISTS trigger_fleet_ships_change_points ON fleet_ships;
CREATE TRIGGER trigger_fleet_ships_change_points
  AFTER INSERT OR UPDATE OR DELETE ON fleet_ships
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_fleet_points_on_fleet_ships_change();

-- Recalculate points for all players to correct any existing discrepancies
SELECT recalculate_all_player_points();
