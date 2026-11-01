/*
  # Fleet Acceleration System

  ## Description
  Allows players to pay FXU to instantly complete fleet journeys (both outgoing and returning).
  A configurable percentage of the FXU payment goes to the jackpot pools.
  
  ## Features
  1. Progressive FXU cost based on remaining flight time
  2. Configurable FXU ratio (resources per FXU) in admin panel
  3. Configurable jackpot contribution percentage
  4. Works for both outgoing and returning fleets
  5. Notifies defender when hostile fleets are accelerated
  
  ## New Functions
  - `calculate_fxu_cost_fleet` - Calculates FXU cost for fleet acceleration
  - `accelerate_fleet` - Accelerates a fleet to instant arrival paying FXU
  - `get_fleet_acceleration_settings` - Gets current admin settings
  
  ## Security
  - Only fleet owner can accelerate their own fleets
  - Cannot accelerate already arrived fleets
  - FXU balance validation before deduction
*/

-- Add fleet acceleration settings to game_settings
INSERT INTO game_settings (key, value, description) VALUES
  ('fxu_cost_ratio_fleet', '5000', 'Resource value per FXU for fleet acceleration (higher = cheaper)'),
  ('fleet_acceleration_jackpot_percent', '49', 'Percentage of fleet acceleration FXU that goes to jackpot (0-100)')
ON CONFLICT (key) DO NOTHING;

-- Function to calculate FXU cost for fleet acceleration
CREATE OR REPLACE FUNCTION calculate_fxu_cost_fleet(p_fleet_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fleet fleets%ROWTYPE;
  v_seconds_remaining integer;
  v_total_flight_time integer;
  v_time_ratio numeric;
  v_base_fuel_cost bigint;
  v_total_ship_value bigint := 0;
  v_fleet_ship RECORD;
  v_ship_type ship_types%ROWTYPE;
  v_resource_value numeric;
  v_fxu_ratio numeric;
  v_fxu_cost numeric;
  v_target_time timestamptz;
  v_start_time timestamptz;
BEGIN
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  
  IF v_fleet IS NULL OR v_fleet.is_completed THEN
    RETURN 0;
  END IF;
  
  -- Determine which time to use based on returning status
  IF v_fleet.is_returning THEN
    v_target_time := v_fleet.return_time;
    -- For returning fleets, start time is when they started returning (arrival_time)
    v_start_time := v_fleet.arrival_time;
  ELSE
    v_target_time := v_fleet.arrival_time;
    v_start_time := v_fleet.departure_time;
  END IF;
  
  v_seconds_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_target_time - now()))::integer);
  
  IF v_seconds_remaining <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate total flight time
  v_total_flight_time := GREATEST(1, EXTRACT(EPOCH FROM (v_target_time - v_start_time))::integer);
  
  -- Calculate time ratio (percentage of time remaining)
  v_time_ratio := v_seconds_remaining::numeric / v_total_flight_time::numeric;
  
  -- Calculate total ship value (metal + crystal + deuterium cost of all ships)
  FOR v_fleet_ship IN 
    SELECT fs.ship_type_id, fs.quantity
    FROM fleet_ships fs
    WHERE fs.fleet_id = p_fleet_id
  LOOP
    SELECT * INTO v_ship_type FROM ship_types WHERE id = v_fleet_ship.ship_type_id;
    IF v_ship_type IS NOT NULL THEN
      v_total_ship_value := v_total_ship_value + (
        (COALESCE(v_ship_type.metal_cost, 0) + 
         COALESCE(v_ship_type.crystal_cost, 0) + 
         COALESCE(v_ship_type.deuterium_cost, 0)) * v_fleet_ship.quantity
      );
    END IF;
  END LOOP;
  
  -- Add cargo value
  v_total_ship_value := v_total_ship_value + 
    COALESCE(v_fleet.cargo_metal, 0) + 
    COALESCE(v_fleet.cargo_crystal, 0) + 
    COALESCE(v_fleet.cargo_deuterium, 0);
  
  -- Add fuel cost as part of value
  v_total_ship_value := v_total_ship_value + COALESCE(v_fleet.fuel_consumption, 0);
  
  -- Use distance as a factor (longer trips cost more)
  -- Base resource value = ship value * distance factor
  v_resource_value := v_total_ship_value::numeric * (1 + (v_total_flight_time::numeric / 3600));
  
  -- Get FXU ratio from settings
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';
  
  IF v_fxu_ratio IS NULL OR v_fxu_ratio <= 0 THEN
    v_fxu_ratio := 5000;
  END IF;
  
  -- Base FXU cost
  v_fxu_cost := v_resource_value / v_fxu_ratio;
  
  -- Apply time ratio - cost decreases as time passes
  v_fxu_cost := v_fxu_cost * v_time_ratio;
  
  -- Minimum cost is 1 FXU
  RETURN GREATEST(1, CEIL(v_fxu_cost))::integer;
END;
$$;

-- Function to accelerate a fleet
CREATE OR REPLACE FUNCTION accelerate_fleet(p_fleet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_fleet fleets%ROWTYPE;
  v_fxu_cost integer;
  v_current_fxu numeric;
  v_jackpot_percent numeric;
  v_jackpot_amount numeric;
  v_revenue_amount numeric;
  v_target_planet planets%ROWTYPE;
  v_defender_id uuid;
  v_origin_coords text;
  v_is_hostile boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  -- Get fleet
  SELECT * INTO v_fleet FROM fleets WHERE id = p_fleet_id;
  
  IF v_fleet IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Flota no encontrada');
  END IF;
  
  -- Check ownership
  IF v_fleet.user_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'No eres el propietario de esta flota');
  END IF;
  
  -- Check if already completed
  IF v_fleet.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota ya ha llegado');
  END IF;
  
  -- Calculate FXU cost
  v_fxu_cost := calculate_fxu_cost_fleet(p_fleet_id);
  
  IF v_fxu_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'La flota esta a punto de llegar');
  END IF;
  
  -- Check FXU balance
  SELECT fxu_balance INTO v_current_fxu FROM profiles WHERE id = v_user_id;
  
  IF v_current_fxu IS NULL OR v_current_fxu < v_fxu_cost THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'FXU insuficiente. Necesitas ' || v_fxu_cost || ' FXU (tienes ' || COALESCE(v_current_fxu, 0)::integer || ')'
    );
  END IF;
  
  -- Get jackpot percentage from settings
  SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
  FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';
  
  IF v_jackpot_percent < 0 THEN v_jackpot_percent := 0; END IF;
  IF v_jackpot_percent > 100 THEN v_jackpot_percent := 100; END IF;
  
  -- Calculate jackpot and revenue amounts
  v_jackpot_amount := FLOOR(v_fxu_cost * v_jackpot_percent / 100);
  v_revenue_amount := v_fxu_cost - v_jackpot_amount;
  
  -- Deduct FXU from user
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_fxu_cost 
  WHERE id = v_user_id;
  
  -- Record revenue
  IF v_revenue_amount > 0 THEN
    INSERT INTO admin_revenue (type, amount, user_id, description)
    VALUES ('fleet_acceleration', v_revenue_amount, v_user_id, 
      'Aceleracion de flota ' || v_fleet.mission_type || 
      CASE WHEN v_fleet.is_returning THEN ' (regreso)' ELSE '' END
    );
  END IF;
  
  -- Contribute to jackpot pools
  IF v_jackpot_amount > 0 THEN
    PERFORM contribute_to_jackpot_pools(v_user_id, v_jackpot_amount, 'fleet_acceleration');
  END IF;
  
  -- Check if this is a hostile mission (for defender notification)
  v_is_hostile := v_fleet.mission_type IN ('attack', 'espionage', 'acs_attack') AND NOT v_fleet.is_returning;
  
  -- If hostile, notify the defender
  IF v_is_hostile THEN
    SELECT p.* INTO v_target_planet
    FROM planets p
    WHERE p.galaxy = v_fleet.target_galaxy 
      AND p.solar_system = v_fleet.target_system 
      AND p.position = v_fleet.target_position
    LIMIT 1;
    
    IF v_target_planet IS NOT NULL AND v_target_planet.user_id != v_user_id THEN
      v_defender_id := v_target_planet.user_id;
      
      -- Get origin coordinates for the message
      SELECT '[' || p.galaxy || ':' || p.solar_system || ':' || p.position || ']' INTO v_origin_coords
      FROM planets p WHERE p.id = v_fleet.origin_planet_id;
      
      -- Send notification to defender
      INSERT INTO messages (recipient_id, sender_name, subject, body, message_type)
      VALUES (
        v_defender_id,
        'Sistema de Defensa',
        'ALERTA: Flota hostil acelerada',
        'Una flota hostil de tipo "' || v_fleet.mission_type || '" procedente de ' || COALESCE(v_origin_coords, 'coordenadas desconocidas') || 
        ' ha sido ACELERADA y llegara antes de lo previsto a tu planeta en [' || 
        v_fleet.target_galaxy || ':' || v_fleet.target_system || ':' || v_fleet.target_position || '].' ||
        E'\n\nPrepara tus defensas inmediatamente.',
        'combat'
      );
    END IF;
  END IF;
  
  -- Update fleet times to now (instant arrival)
  IF v_fleet.is_returning THEN
    UPDATE fleets 
    SET return_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  ELSE
    UPDATE fleets 
    SET arrival_time = now() - interval '1 second'
    WHERE id = p_fleet_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Flota acelerada exitosamente',
    'fxu_spent', v_fxu_cost,
    'jackpot_contribution', v_jackpot_amount
  );
END;
$$;

-- Function to get fleet acceleration settings
CREATE OR REPLACE FUNCTION get_fleet_acceleration_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fxu_ratio numeric;
  v_jackpot_percent numeric;
BEGIN
  SELECT COALESCE(value::numeric, 5000) INTO v_fxu_ratio
  FROM game_settings WHERE key = 'fxu_cost_ratio_fleet';
  
  SELECT COALESCE(value::numeric, 49) INTO v_jackpot_percent
  FROM game_settings WHERE key = 'fleet_acceleration_jackpot_percent';
  
  RETURN jsonb_build_object(
    'fxu_ratio', COALESCE(v_fxu_ratio, 5000),
    'jackpot_percent', COALESCE(v_jackpot_percent, 49)
  );
END;
$$;

-- Admin function to update fleet acceleration settings
CREATE OR REPLACE FUNCTION admin_update_fleet_acceleration_settings(
  p_fxu_ratio numeric DEFAULT NULL,
  p_jackpot_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_admin_id AND is_admin = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  -- Validate inputs
  IF p_fxu_ratio IS NOT NULL AND p_fxu_ratio < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El ratio FXU debe ser al menos 1');
  END IF;
  
  IF p_jackpot_percent IS NOT NULL AND (p_jackpot_percent < 0 OR p_jackpot_percent > 100) THEN
    RETURN jsonb_build_object('success', false, 'error', 'El porcentaje de jackpot debe estar entre 0 y 100');
  END IF;
  
  -- Update FXU ratio
  IF p_fxu_ratio IS NOT NULL THEN
    UPDATE game_settings SET value = p_fxu_ratio::text WHERE key = 'fxu_cost_ratio_fleet';
    IF NOT FOUND THEN
      INSERT INTO game_settings (key, value, description) 
      VALUES ('fxu_cost_ratio_fleet', p_fxu_ratio::text, 'Resource value per FXU for fleet acceleration');
    END IF;
  END IF;
  
  -- Update jackpot percent
  IF p_jackpot_percent IS NOT NULL THEN
    UPDATE game_settings SET value = p_jackpot_percent::text WHERE key = 'fleet_acceleration_jackpot_percent';
    IF NOT FOUND THEN
      INSERT INTO game_settings (key, value, description) 
      VALUES ('fleet_acceleration_jackpot_percent', p_jackpot_percent::text, 'Percentage of fleet acceleration FXU that goes to jackpot');
    END IF;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Configuracion actualizada');
END;
$$;

-- Add 'fleet_acceleration' to admin_revenue type check if needed
DO $$
BEGIN
  ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_type_check;
  ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_type_check 
    CHECK (type IN (
      'instant_building', 'instant_research', 'instant_ships', 'instant_defense',
      'market_fee', 'market_fee_usdt', 'officer_fxu', 'expedition_fee',
      'plus_subscription', 'plus_subscription_usdt', 'supply_box', 'fleet_acceleration'
    ));
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_fxu_cost_fleet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accelerate_fleet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fleet_acceleration_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_fleet_acceleration_settings(numeric, numeric) TO authenticated;
