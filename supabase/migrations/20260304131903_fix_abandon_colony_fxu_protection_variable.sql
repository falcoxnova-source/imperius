/*
  # Fix Abandon Colony FXU Protection Variable

  ## Problem
  The `secure_abandon_colony` function uses `app.fxu_update_allowed` with value `'abandon_colony'`,
  but the FXU balance protection trigger expects `fxu.allow_update_9x7k2m` with value `'true'`.
  This mismatch causes SECURITY_VIOLATION (FXU002) errors when users try to abandon a colony.

  ## Solution
  Replace the incorrect `set_config` call with the correct variable name and value
  that the protection trigger expects.

  ## Functions Updated
  - `secure_abandon_colony` - fix FXU config variable to use `fxu.allow_update_9x7k2m`
*/

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
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  SELECT * INTO v_planet
  FROM planets
  WHERE id = p_planet_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not owned');
  END IF;

  IF v_planet.is_main_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.');
  END IF;

  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE user_id = auth.uid()
      AND is_researching = true
      AND research_planet_id = p_planet_id
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE target_galaxy = v_planet.galaxy
    AND target_system = v_planet.solar_system
    AND target_position = v_planet.position
    AND is_completed = false;

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.');
  END IF;

  SELECT COALESCE(value::numeric, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';

  IF v_fxu_fee IS NULL THEN
    v_fxu_fee := 10000;
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text
    );
  END IF;

  PERFORM set_config('fxu.allow_update_9x7k2m', 'true', true);

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  v_admin_id := get_admin_account_id();
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  DELETE FROM research_queue WHERE planet_id = p_planet_id;

  DELETE FROM planets WHERE id = p_planet_id;

  RETURN jsonb_build_object(
    'success', true,
    'planet_name', v_planet.name,
    'fxu_charged', v_fxu_fee
  );
END;
$$;
