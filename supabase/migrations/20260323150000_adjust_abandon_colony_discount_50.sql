-- ============================================================================
-- AJUSTE: Descuento VIP en abandonar colonias de 80% → 50%
-- ============================================================================
-- Antes: VIP pagaba 20% del coste (80% descuento) → v_fxu_fee * 0.20
-- Ahora: VIP paga 50% del coste (50% descuento) → v_fxu_fee * 0.50
-- ============================================================================

-- Solo actualizar la línea del descuento dentro de secure_abandon_colony
-- Necesitamos recrear la función completa porque PL/pgSQL no permite ALTER parcial

CREATE OR REPLACE FUNCTION secure_abandon_colony(p_planet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_planet record;
  v_homeworld_id uuid;
  v_active_builds integer;
  v_active_shipyard integer;
  v_active_research integer;
  v_active_fleets integer;
  v_incoming_fleets integer;
  v_fxu_fee integer;
  v_user_fxu numeric;
  v_admin_id uuid;
  v_is_plus boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF is_user_in_vacation_mode(v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while in vacation mode');
  END IF;

  SELECT * INTO v_planet FROM planets WHERE id = p_planet_id AND owner_id = v_user_id;

  IF v_planet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Planet not found or not yours');
  END IF;

  SELECT homeworld_id INTO v_homeworld_id FROM profiles WHERE id = v_user_id;

  IF v_planet.id = v_homeworld_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon your homeworld');
  END IF;

  SELECT COUNT(*) INTO v_active_builds FROM building_queue
  WHERE planet_id = p_planet_id AND status IN ('in_progress', 'pending');

  IF v_active_builds > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active building construction. Cancel it first.');
  END IF;

  SELECT COUNT(*) INTO v_active_shipyard FROM shipyard_queue
  WHERE planet_id = p_planet_id AND status IN ('in_progress', 'pending');

  IF v_active_shipyard > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active shipyard production. Cancel it first.');
  END IF;

  SELECT COUNT(*) INTO v_active_research FROM research_queue
  WHERE user_id = v_user_id AND status IN ('in_progress', 'pending');

  IF v_active_research > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active research. Cancel research first.');
  END IF;

  SELECT COUNT(*) INTO v_active_fleets FROM fleets
  WHERE user_id = v_user_id AND source_planet_id = p_planet_id AND status IN ('traveling', 'returning');

  IF v_active_fleets > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony with active fleets. Recall all fleets first.');
  END IF;

  SELECT COUNT(*) INTO v_incoming_fleets FROM fleets
  WHERE destination_planet_id = p_planet_id AND status = 'traveling';

  IF v_incoming_fleets > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot abandon colony while fleets are heading to it. Wait until they arrive.');
  END IF;

  SELECT COALESCE(value::integer, 10000) INTO v_fxu_fee
  FROM game_settings WHERE key = 'fxu_abandon_colony_fee';
  IF v_fxu_fee IS NULL OR v_fxu_fee <= 0 THEN
    v_fxu_fee := 10000;
  END IF;

  -- VIP discount: 50% off colony abandonment (changed from 80%)
  v_is_plus := is_user_plus(auth.uid());
  IF v_is_plus THEN
    v_fxu_fee := v_fxu_fee * 0.50;
  END IF;

  SELECT COALESCE(fxu_balance, 0) INTO v_user_fxu
  FROM profiles WHERE id = auth.uid();

  IF v_user_fxu < v_fxu_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient FXU. Required: ' || v_fxu_fee::text || ', Available: ' || v_user_fxu::text
    );
  END IF;

  PERFORM _internal_set_fxu_context();

  UPDATE profiles SET fxu_balance = fxu_balance - v_fxu_fee WHERE id = v_user_id;

  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != v_user_id THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fxu_fee WHERE id = v_admin_id;
  END IF;

  PERFORM record_admin_revenue('colony_abandon', v_fxu_fee, 'Abandon colony: ' || v_planet.name, v_user_id, p_planet_id);

  DELETE FROM planet_buildings WHERE planet_id = p_planet_id;
  DELETE FROM planet_defenses WHERE planet_id = p_planet_id;
  DELETE FROM planet_ships WHERE planet_id = p_planet_id;

  UPDATE planets SET
    owner_id = NULL,
    name = 'Abandoned Colony',
    metal = 500,
    crystal = 500,
    deuterium = 0,
    solar_energy = 0,
    used_energy = 0,
    max_fields = 163,
    used_fields = 0,
    metal_per_hour = 0,
    crystal_per_hour = 0,
    deuterium_per_hour = 0,
    is_homeworld = false,
    last_resource_update = now(),
    image = 'abandoned'
  WHERE id = p_planet_id;

  PERFORM update_user_points(v_user_id);

  RETURN jsonb_build_object('success', true, 'fxu_spent', v_fxu_fee);
END;
$$;
