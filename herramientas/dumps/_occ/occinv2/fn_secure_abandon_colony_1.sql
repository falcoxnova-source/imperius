CREATE OR REPLACE FUNCTION public.secure_abandon_colony(p_planet_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
  v_planet planets%ROWTYPE;
  v_fxu_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_active_fleet_count integer;
  v_building_queue_count integer;
  v_shipyard_queue_count integer;
  v_research_on_planet boolean;
  v_regeneration_days integer;
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

  -- ??? DEPLETION: If planet is depleted, use depletion flow instead of destruction
  IF v_planet.planet_status = 'depleted' THEN
    SELECT COALESCE(value::integer, 30) INTO v_regeneration_days
    FROM game_settings WHERE key = 'depletion_regeneration_days';
    
    -- Clear planet ownership and mark for regeneration
    UPDATE planets SET
      user_id = NULL,
      planet_status = 'regenerating',
      regenerates_at = now() + (v_regeneration_days || ' days')::interval,
      last_update = now()
    WHERE id = p_planet_id;
    
    -- Delete related data (buildings, ships, defenses, resources)
    DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
    DELETE FROM planet_ships WHERE planet_id = p_planet_id;
    DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
    DELETE FROM planet_resources WHERE planet_id = p_planet_id;
    DELETE FROM building_queue WHERE planet_id = p_planet_id;
    DELETE FROM shipyard_queue WHERE planet_id = p_planet_id;
    DELETE FROM supply_box_purchases WHERE planet_id = p_planet_id;
    
    -- Nullify references
    UPDATE fleets SET origin_planet_id = NULL WHERE origin_planet_id = p_planet_id;
    -- (Las ofertas de venta se CANCELAN automaticamente via trg_cancel_listings_on_planet_loss al quitar el dueno del planeta)
    UPDATE user_technologies SET research_planet_id = NULL WHERE research_planet_id = p_planet_id;
    UPDATE galaxy_positions SET occupied_by = NULL, is_occupied = false WHERE occupied_by = p_planet_id;
    
    -- Reset fields
    UPDATE planets SET fields_used = 0 WHERE id = p_planet_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Colony abandoned. Planet will regenerate in ' || v_regeneration_days || ' days.',
      'regenerates_at', now() + (v_regeneration_days || ' days')::interval
    );
  END IF;

  -- Check for active building queue on this planet
  SELECT COUNT(*) INTO v_building_queue_count
  FROM building_queue
  WHERE planet_id = p_planet_id;

  IF v_building_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active building queue');
  END IF;

  -- Check for active shipyard queue
  SELECT COUNT(*) INTO v_shipyard_queue_count
  FROM shipyard_queue
  WHERE planet_id = p_planet_id;

  IF v_shipyard_queue_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active shipyard queue');
  END IF;

  -- Check for research on this planet
  SELECT EXISTS(
    SELECT 1 FROM user_technologies
    WHERE research_planet_id = p_planet_id AND is_researching = true
  ) INTO v_research_on_planet;

  IF v_research_on_planet THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active research');
  END IF;

  -- Check for active fleets from this planet
  SELECT COUNT(*) INTO v_active_fleet_count
  FROM fleets
  WHERE origin_planet_id = p_planet_id AND arrival_time > now();

  IF v_active_fleet_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon planet with active fleets');
  END IF;

  -- Get FXU fee
  SELECT COALESCE(value::numeric, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';

  -- Check FXU balance
  SELECT fxu_balance INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient FXU. Required: ' || v_fxu_fee || ' FXU');
  END IF;

  -- Deduct FXU
  PERFORM set_config('app.fxu_update_allowed', 'abandon_colony', true);
  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = auth.uid();

  -- Pay admin
  SELECT get_admin_account_id() INTO v_admin_id;
  IF v_admin_id IS NOT NULL AND v_admin_id != auth.uid() THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  -- Delete planet (cascading)
  -- DELETE FROM planets WHERE id = p_planet_id; -- replaced by ruin logic below

    -- [ABANDON RUINS] Clear data, leave planet as grey uninhabitable ruin
  DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
  DELETE FROM planet_ships WHERE planet_id = p_planet_id;
  DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
  DELETE FROM planet_resources WHERE planet_id = p_planet_id;
  DELETE FROM building_queue WHERE planet_id = p_planet_id;
  DELETE FROM shipyard_queue WHERE planet_id = p_planet_id;
  UPDATE fleets SET origin_planet_id = NULL WHERE origin_planet_id = p_planet_id;
  -- (Las ofertas de venta se CANCELAN automaticamente via trg_cancel_listings_on_planet_loss al quitar el dueno del planeta)
  UPDATE user_technologies SET research_planet_id = NULL WHERE research_planet_id = p_planet_id;
  UPDATE planets SET user_id = NULL, name = 'Ruinas', planet_status = 'abandoned', fields_used = 0, is_destroyed = true WHERE id = p_planet_id;
  UPDATE galaxy_positions SET occupied_by = NULL, is_occupied = false WHERE occupied_by = p_planet_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Colonia abandonada. Las ruinas permanecen.');
END;

$function$

