/*
  # Expedition Extra Fee System
  
  ## Summary
  Implements a configurable FXU fee for extra expedition slots beyond the first free one.
  
  ## Changes
  1. New Settings
    - `expedition_extra_fee_fxu` - FXU cost for each additional simultaneous expedition (default 1000)
  
  2. New Functions
    - `get_expedition_extra_fee()` - Returns the configured fee
    - `get_active_expedition_count(uuid)` - Counts active expeditions for a user
    - `update_expedition_fee_setting(numeric)` - Admin function to update fee
  
  3. Modified Functions
    - `validate_fleet_mission` - Now checks expedition count and charges FXU for extras
  
  ## Business Logic
  - First expedition is always FREE
  - Second and subsequent simultaneous expeditions cost FXU
  - Fee is charged when sending the fleet (before departure)
  - If user lacks FXU, expedition is blocked with clear error message
  
  ## Security
  - Only admins can update the expedition fee
  - Fee deduction uses secure FXU context
  - All operations are properly validated
*/

-- Add expedition extra fee setting
INSERT INTO game_settings (key, value, description)
VALUES ('expedition_extra_fee_fxu', '1000', 'Costo en FXU por cada expedicion extra simultanea')
ON CONFLICT (key) DO UPDATE SET description = 'Costo en FXU por cada expedicion extra simultanea';

-- Function to get expedition extra fee
CREATE OR REPLACE FUNCTION get_expedition_extra_fee()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fee numeric;
BEGIN
  SELECT COALESCE(value::numeric, 1000) INTO v_fee
  FROM game_settings
  WHERE key = 'expedition_extra_fee_fxu';
  
  RETURN COALESCE(v_fee, 1000);
END;
$$;

-- Function to count active expeditions for a user
CREATE OR REPLACE FUNCTION get_active_expedition_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM fleets
  WHERE user_id = p_user_id
    AND mission_type = 'expedition'
    AND is_completed = false;
  
  RETURN COALESCE(v_count, 0);
END;
$$;

-- Admin function to update expedition fee setting
CREATE OR REPLACE FUNCTION update_expedition_fee_setting(p_fee numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;
  
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  
  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autorizado');
  END IF;
  
  IF p_fee IS NULL OR p_fee < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'El fee debe ser un numero positivo');
  END IF;
  
  UPDATE game_settings 
  SET value = p_fee::text, updated_at = now()
  WHERE key = 'expedition_extra_fee_fxu';
  
  IF NOT FOUND THEN
    INSERT INTO game_settings (key, value, description)
    VALUES ('expedition_extra_fee_fxu', p_fee::text, 'Costo en FXU por cada expedicion extra simultanea');
  END IF;
  
  RETURN jsonb_build_object('success', true, 'message', 'Fee de expedicion actualizado a ' || p_fee::text || ' FXU');
END;
$$;

-- Update fee settings function to include expedition fee
CREATE OR REPLACE FUNCTION get_fee_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_market_fee numeric;
  v_referral_commission numeric;
  v_expedition_fee numeric;
BEGIN
  SELECT COALESCE(value::numeric, 10) INTO v_market_fee
  FROM game_settings WHERE key = 'market_fee_percent';
  
  SELECT COALESCE(value::numeric, 5) INTO v_referral_commission
  FROM game_settings WHERE key = 'referral_commission_percent';
  
  SELECT COALESCE(value::numeric, 1000) INTO v_expedition_fee
  FROM game_settings WHERE key = 'expedition_extra_fee_fxu';
  
  RETURN jsonb_build_object(
    'market_fee_percent', COALESCE(v_market_fee, 10),
    'referral_commission_percent', COALESCE(v_referral_commission, 5),
    'expedition_extra_fee_fxu', COALESCE(v_expedition_fee, 1000)
  );
END;
$$;

-- Function to charge expedition fee (called when sending extra expedition)
CREATE OR REPLACE FUNCTION charge_expedition_fee(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active_expeditions integer;
  v_fee numeric;
  v_user_fxu numeric;
  v_admin_id uuid;
BEGIN
  v_active_expeditions := get_active_expedition_count(p_user_id);
  
  -- First expedition is free
  IF v_active_expeditions = 0 THEN
    RETURN jsonb_build_object(
      'success', true, 
      'charged', false, 
      'fee', 0,
      'message', 'Primera expedicion - gratis'
    );
  END IF;
  
  v_fee := get_expedition_extra_fee();
  
  -- Get user FXU balance
  SELECT fxu_balance INTO v_user_fxu
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;
  
  IF v_user_fxu IS NULL OR v_user_fxu < v_fee THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Necesitas %s FXU para enviar una expedicion adicional. Tienes: %s FXU', 
                      v_fee::text, COALESCE(v_user_fxu, 0)::text),
      'required_fee', v_fee,
      'current_balance', COALESCE(v_user_fxu, 0)
    );
  END IF;
  
  -- Set FXU context for secure update
  PERFORM _internal_set_fxu_context();
  
  -- Deduct fee from user
  UPDATE profiles 
  SET fxu_balance = fxu_balance - v_fee
  WHERE id = p_user_id;
  
  -- Add fee to admin (revenue)
  SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    UPDATE profiles SET fxu_balance = fxu_balance + v_fee WHERE id = v_admin_id;
    
    -- Record revenue
    INSERT INTO admin_revenue (revenue_type, amount, description, user_id)
    VALUES ('expedition_fee', v_fee, 'Fee por expedicion extra #' || (v_active_expeditions + 1)::text, p_user_id);
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'charged', true,
    'fee', v_fee,
    'expedition_number', v_active_expeditions + 1,
    'message', format('Expedicion #%s - Cobrado %s FXU', (v_active_expeditions + 1)::text, v_fee::text)
  );
END;
$$;

-- Add expedition_fee to revenue types if not exists
DO $$
BEGIN
  ALTER TABLE admin_revenue DROP CONSTRAINT IF EXISTS admin_revenue_revenue_type_check;
  ALTER TABLE admin_revenue ADD CONSTRAINT admin_revenue_revenue_type_check 
    CHECK (revenue_type IN ('market_fee', 'instant_building', 'instant_research', 'instant_shipyard', 'instant_defense', 'officer_purchase', 'officer_fxu', 'expedition_fee', 'other'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- Update the validate_fleet_mission function (6 params version) to check expedition fees
CREATE OR REPLACE FUNCTION public.validate_fleet_mission(
  p_user_id uuid, 
  p_origin_planet_id uuid, 
  p_target_galaxy integer, 
  p_target_system integer, 
  p_target_position integer, 
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origin_planet RECORD;
  v_target_planet RECORD;
  v_target_user_id uuid;
  v_bashing_check jsonb;
  v_protection_check jsonb;
  v_user_alliance_id uuid;
  v_target_alliance_id uuid;
  v_expedition_result jsonb;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
BEGIN
  -- Check vacation mode for attacker
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;
  
  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Validate user owns the origin planet
  SELECT * INTO v_origin_planet
  FROM planets
  WHERE id = p_origin_planet_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'No tienes acceso a este planeta');
  END IF;

  -- Get user's alliance from alliance_members table
  SELECT alliance_id INTO v_user_alliance_id 
  FROM alliance_members 
  WHERE user_id = p_user_id;

  -- ===========================================
  -- EXPEDITION MISSION: Check position and FXU fee
  -- ===========================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    
    -- Check and charge expedition fee
    v_expedition_result := charge_expedition_fee(p_user_id);
    
    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;
    
    -- Return success with expedition info
    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- For recycle mission, check debris field exists
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
      AND solar_system = p_target_system
      AND position = p_target_position
      AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- Get target planet
  SELECT * INTO v_target_planet
  FROM planets
  WHERE galaxy = p_target_galaxy
  AND solar_system = p_target_system
  AND position = p_target_position;

  -- Check vacation mode for defender
  IF v_target_planet IS NOT NULL AND p_mission_type = ANY(v_hostile_missions) THEN
    DECLARE
      v_target_vacation boolean;
    BEGIN
      SELECT vacation_mode INTO v_target_vacation
      FROM profiles WHERE id = v_target_planet.user_id;
      
      IF COALESCE(v_target_vacation, false) THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'No puedes atacar a jugadores en modo vacaciones'
        );
      END IF;
    END;
  END IF;

  -- For colonize, position must be empty
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Ya existe un planeta en esas coordenadas');
    END IF;
    IF p_target_position < 1 OR p_target_position > 15 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Posicion invalida para colonizar');
    END IF;
    RETURN jsonb_build_object('valid', true);
  END IF;

  -- For attack/espionage, check target exists and protections
  IF p_mission_type IN ('attack', 'espionage') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tu propio planeta');
    END IF;

    -- Check bashing rule for attacks
    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_rule(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;

    -- Check noob protection
    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'allowed')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- TRANSPORT & DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    -- Deploy: Only to own planets
    IF p_mission_type = 'deploy' THEN
      IF v_target_planet.user_id != p_user_id THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes desplegar en tus propios planetas');
      END IF;
      RETURN jsonb_build_object('valid', true);
    END IF;

    -- Transport: Check alliance restriction
    IF p_mission_type = 'transport' THEN
      v_target_user_id := v_target_planet.user_id;

      -- Can always transport to own planets
      IF v_target_user_id = p_user_id THEN
        RETURN jsonb_build_object('valid', true);
      END IF;

      -- Check if user is in an alliance
      IF v_user_alliance_id IS NULL THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Debes estar en una alianza para enviar recursos a otros jugadores. Usa "Desplegar" para tus propios planetas.'
        );
      END IF;

      -- Get target user's alliance from alliance_members table
      SELECT alliance_id INTO v_target_alliance_id 
      FROM alliance_members 
      WHERE user_id = v_target_user_id;

      -- Check if target is in the same alliance
      IF v_target_alliance_id IS NULL OR v_target_alliance_id != v_user_alliance_id THEN
        RETURN jsonb_build_object(
          'valid', false, 
          'reason', 'Solo puedes transportar recursos a miembros de tu alianza. El jugador destino no esta en tu alianza.'
        );
      END IF;

      -- Both users are in the same alliance
      RETURN jsonb_build_object('valid', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$function$;

-- Also update the 5-param version for consistency (used by some older code paths)
CREATE OR REPLACE FUNCTION validate_fleet_mission(
  p_user_id uuid,
  p_target_galaxy integer,
  p_target_system integer,
  p_target_position integer,
  p_mission_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_planet record;
  v_protection_check jsonb;
  v_bashing_check jsonb;
  v_max_colonies integer;
  v_current_colonies integer;
  v_astrophysics_level integer;
  v_attacker_vacation boolean;
  v_hostile_missions text[] := ARRAY['attack', 'espionage', 'destroy'];
  v_expedition_result jsonb;
BEGIN
  -- Check vacation mode for attacker
  SELECT vacation_mode INTO v_attacker_vacation
  FROM profiles WHERE id = p_user_id;
  
  IF COALESCE(v_attacker_vacation, false) AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes enviar misiones hostiles mientras estas en modo vacaciones'
    );
  END IF;

  -- Get target planet if exists
  SELECT p.*, pr.id as owner_id, pr.vacation_mode as target_vacation_mode 
  INTO v_target_planet
  FROM planets p
  LEFT JOIN profiles pr ON p.user_id = pr.id
  WHERE p.galaxy = p_target_galaxy
    AND p.solar_system = p_target_system
    AND p.position = p_target_position
    AND p.planet_type = 'planet'
    AND NOT p.is_destroyed;

  -- Check vacation mode for defender
  IF v_target_planet IS NOT NULL 
     AND v_target_planet.target_vacation_mode = true 
     AND p_mission_type = ANY(v_hostile_missions) THEN
    RETURN jsonb_build_object(
      'valid', false, 
      'reason', 'No puedes atacar a jugadores en modo vacaciones'
    );
  END IF;

  -- ===========================================
  -- COLONIZE MISSION
  -- ===========================================
  IF p_mission_type = 'colonize' THEN
    IF v_target_planet IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'La posicion ya esta ocupada');
    END IF;

    SELECT COUNT(*) INTO v_current_colonies
    FROM planets WHERE user_id = p_user_id AND NOT is_destroyed;

    SELECT COALESCE(ut.level, 0) INTO v_astrophysics_level
    FROM user_technologies ut
    JOIN technology_types tt ON ut.technology_type_id = tt.id
    WHERE ut.user_id = p_user_id AND tt.code = 'astrophysics';

    v_max_colonies := 1 + FLOOR((COALESCE(v_astrophysics_level, 0) + 1) / 2);

    IF v_current_colonies >= v_max_colonies THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', format('Has alcanzado el maximo de colonias (%s). Investiga Astrofisica.', v_max_colonies)
      );
    END IF;

    RETURN jsonb_build_object('valid', true);
  END IF;

  -- ===========================================
  -- EXPEDITION MISSION: Check position 16 AND charge FXU fee
  -- ===========================================
  IF p_mission_type = 'expedition' THEN
    IF p_target_position != 16 THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Las expediciones deben ir a la posicion 16');
    END IF;
    
    -- Check and charge expedition fee
    v_expedition_result := charge_expedition_fee(p_user_id);
    
    IF NOT (v_expedition_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'valid', false, 
        'reason', v_expedition_result->>'error',
        'expedition_fee_required', (v_expedition_result->>'required_fee')::numeric,
        'current_fxu', (v_expedition_result->>'current_balance')::numeric
      );
    END IF;
    
    RETURN jsonb_build_object(
      'valid', true,
      'expedition_charged', (v_expedition_result->>'charged')::boolean,
      'expedition_fee', (v_expedition_result->>'fee')::numeric,
      'expedition_number', (v_expedition_result->>'expedition_number')::integer
    );
  END IF;

  -- ===========================================
  -- ATTACK / ESPIONAGE / DESTROY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('attack', 'espionage', 'destroy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF v_target_planet.user_id = p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No puedes atacar tus propios planetas');
    END IF;

    v_protection_check := check_noob_protection(p_user_id, v_target_planet.user_id);
    IF NOT (v_protection_check->>'can_attack')::boolean THEN
      RETURN jsonb_build_object('valid', false, 'reason', v_protection_check->>'reason');
    END IF;

    IF p_mission_type = 'attack' THEN
      v_bashing_check := check_bashing_limit(p_user_id, v_target_planet.user_id);
      IF NOT (v_bashing_check->>'allowed')::boolean THEN
        RETURN jsonb_build_object('valid', false, 'reason', v_bashing_check->>'reason');
      END IF;
    END IF;
  END IF;

  -- ===========================================
  -- TRANSPORT / DEPLOY MISSIONS
  -- ===========================================
  IF p_mission_type IN ('transport', 'deploy') THEN
    IF v_target_planet IS NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay planeta en esas coordenadas');
    END IF;

    IF p_mission_type = 'deploy' AND v_target_planet.user_id != p_user_id THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Solo puedes estacionar en tus propios planetas');
    END IF;
  END IF;

  -- ===========================================
  -- RECYCLE MISSION
  -- ===========================================
  IF p_mission_type = 'recycle' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debris_fields
      WHERE galaxy = p_target_galaxy
        AND solar_system = p_target_system
        AND position = p_target_position
        AND (metal > 0 OR crystal > 0)
    ) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'No hay campo de escombros en esas coordenadas');
    END IF;
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

COMMENT ON FUNCTION charge_expedition_fee(uuid) IS 
'Charges FXU fee for extra expeditions. First expedition is free, subsequent ones cost FXU.';

COMMENT ON FUNCTION get_expedition_extra_fee() IS 
'Returns the configured FXU cost for extra expeditions from game_settings.';

COMMENT ON FUNCTION get_active_expedition_count(uuid) IS 
'Counts active (non-completed) expedition fleets for a user.';