/*
  # Abandon Colony (Destroy Planet) with FXU Fee

  1. Changes
    - Adds `fxu_abandon_colony_fee` setting to game_settings (default: 5000)
    - Creates `secure_abandon_colony` function for users to voluntarily abandon a colony
    - FXU is deducted from user and deposited to admin account

  2. Validations
    - User must be authenticated and not in vacation mode
    - Planet must belong to the user
    - Cannot abandon homeworld (is_main_planet = true)
    - Cannot abandon if there are active building/shipyard queues
    - Cannot abandon if user is researching on this planet
    - Cannot abandon if there are active fleets originating from or targeting this planet
    - User must have enough FXU to pay the fee

  3. Cascade Behavior (handled by existing FK constraints)
    - CASCADE delete: planet_buildings, planet_ships, planet_defenses,
      planet_resources, building_queue, shipyard_queue, supply_box_purchases
    - SET NULL: fleets.origin_planet_id, galaxy_positions.occupied_by,
      market_listings.planet_id, user_technologies.research_planet_id

  4. Security
    - Uses existing `get_admin_account_id()` helper
    - SECURITY DEFINER with fixed search_path
*/

-- Add abandon colony fee setting
INSERT INTO game_settings (key, value, description)
VALUES ('fxu_abandon_colony_fee', '10000', 'FXU fee charged to abandon (destroy) a colony')
ON CONFLICT (key) DO NOTHING;

-- Create secure_abandon_colony function
CREATE OR REPLACE FUNCTION secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_planet planets%ROWTYPE;
  v_fxu_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_active_fleet_count integer;
  v_building_queue_count integer;
  v_shipyard_queue_count integer;
  v_research_on_planet boolean;
BEGIN
  -- Authentication check
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Vacation mode check
  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  -- Validate planet ownership
  SELECT * INTO v_planet
  FROM planets
  WHERE id = p_planet_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  -- Cannot abandon homeworld
  IF v_planet.is_main_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  -- Check for active building queue on this planet
  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.');
  END IF;

  -- Check for active shipyard queue on this planet
  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.');
  END IF;

  -- Check if user is researching on this planet
  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid()
      AND is_researching = true
      AND research_planet_id = p_planet_id
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.');
  END IF;

  -- Check for active fleets originating from this planet
  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.');
  END IF;

  -- Check for active fleets targeting this planet's coordinates
  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE target_galaxy = v_planet.galaxy
    AND target_system = v_planet.solar_system
    AND target_position = v_planet.position
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.');
  END IF;

  -- Read FXU abandon fee from settings
  SELECT COALESCE(value::numeric, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';

  IF v_fxu_fee IS NULL THEN
    v_fxu_fee := 10000;
  END IF;

  -- Check user FXU balance
  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text
    );
  END IF;

  -- Charge FXU fee to user
  PERFORM set_config('app.fxu_update_allowed', 'abandon_colony', true);
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  -- Deposit FXU fee to admin
  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  -- Clean up research_queue entries for this planet (safety measure)
  DELETE FROM research_queue WHERE planet_id = p_planet_id;

  -- Delete the planet — CASCADE handles:
  --   planet_buildings, planet_ships, planet_defenses, planet_resources,
  --   building_queue, shipyard_queue, supply_box_purchases
  -- SET NULL handles:
  --   galaxy_positions.occupied_by, market_listings.planet_id,
  --   user_technologies.research_planet_id
  DELETE FROM planets WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_name', v_planet.name,
    'fxu_charged', v_fxu_fee
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION secure_abandon_colony(uuid) TO authenticated;
