/*
  # Fix Referral Code Generation for New Users

  ## Problem
  New users were not getting a referral_code generated automatically
  because the handle_new_user trigger did not include it.

  ## Solution
  1. Update handle_new_user trigger to generate referral_code on signup
  2. Generate referral_code for existing users who don't have one
  3. Update get_referral_stats to generate code if missing (fallback)

  ## Changes
  - Modified: handle_new_user() function
  - Modified: get_referral_stats() function
  - Data fix: Generate codes for users without one
*/

-- First, generate referral codes for any users who don't have one
UPDATE profiles
SET referral_code = UPPER(SUBSTRING(id::text, 1, 8))
WHERE referral_code IS NULL;

-- Update handle_new_user to include referral_code generation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_referral_code text;
  v_start_galaxy integer;
  v_start_system integer;
  v_start_position integer;
  v_planet_id uuid;
  v_attempts integer := 0;
  v_max_attempts integer := 100;
  v_position_found boolean := false;
BEGIN
  -- Determine username with fallback
  v_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    split_part(NEW.email, '@', 1)
  );
  
  -- Ensure username is not empty
  IF v_username IS NULL OR v_username = '' THEN
    v_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  
  -- Handle duplicate username
  IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || substr(NEW.id::text, 1, 4);
  END IF;
  
  -- Generate unique referral code from user ID
  v_referral_code := UPPER(SUBSTRING(NEW.id::text, 1, 8));
  
  -- Create profile with referral_code
  INSERT INTO profiles (id, username, email, dark_matter, fxu_balance, referral_code)
  VALUES (NEW.id, v_username, NEW.email, 0, 1000, v_referral_code);
  
  -- Find empty position for planet
  WHILE NOT v_position_found AND v_attempts < v_max_attempts LOOP
    v_start_galaxy := 1 + floor(random() * 3)::integer;
    v_start_system := 1 + floor(random() * 200)::integer;
    v_start_position := 4 + floor(random() * 9)::integer;
    
    IF NOT EXISTS (
      SELECT 1 FROM planets 
      WHERE galaxy = v_start_galaxy 
      AND solar_system = v_start_system 
      AND position = v_start_position
    ) THEN
      v_position_found := true;
    END IF;
    
    v_attempts := v_attempts + 1;
  END LOOP;
  
  -- Fallback position search
  IF NOT v_position_found THEN
    v_start_galaxy := 1;
    v_start_system := 1;
    v_start_position := 1;
    
    WHILE EXISTS (
      SELECT 1 FROM planets 
      WHERE galaxy = v_start_galaxy 
      AND solar_system = v_start_system 
      AND position = v_start_position
    ) LOOP
      v_start_position := v_start_position + 1;
      IF v_start_position > 15 THEN
        v_start_position := 1;
        v_start_system := v_start_system + 1;
        IF v_start_system > 400 THEN
          v_start_system := 1;
          v_start_galaxy := v_start_galaxy + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  -- Create main planet
  INSERT INTO planets (
    user_id,
    name,
    galaxy,
    solar_system,
    position,
    planet_type,
    diameter,
    fields_max,
    fields_used,
    temp_min,
    temp_max,
    is_main_planet
  ) VALUES (
    NEW.id,
    'Planeta Principal',
    v_start_galaxy,
    v_start_system,
    v_start_position,
    'planet',
    12800,
    163,
    0,
    -20 + floor(random() * 60)::integer,
    20 + floor(random() * 60)::integer,
    true
  )
  RETURNING id INTO v_planet_id;
  
  -- Create planet resources
  INSERT INTO planet_resources (
    planet_id,
    metal,
    crystal,
    deuterium,
    metal_per_hour,
    crystal_per_hour,
    deuterium_per_hour,
    energy_used,
    energy_max
  ) VALUES (
    v_planet_id,
    500,
    300,
    100,
    30,
    15,
    0,
    0,
    0
  );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile already exists, just return
    RAISE LOG 'Profile already exists for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE LOG 'Error in handle_new_user for %: % - %', NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

-- Update get_referral_stats to generate code if missing (fallback safety)
CREATE OR REPLACE FUNCTION get_referral_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_referral_code text;
  v_total_referrals int;
  v_total_fxu numeric;
  v_recent_commissions jsonb;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No autenticado');
  END IF;

  -- Get referral code, generate if missing
  SELECT referral_code INTO v_referral_code FROM profiles WHERE id = v_user_id;
  
  -- If no referral code exists, generate and save it
  IF v_referral_code IS NULL THEN
    v_referral_code := UPPER(SUBSTRING(v_user_id::text, 1, 8));
    UPDATE profiles SET referral_code = v_referral_code WHERE id = v_user_id;
  END IF;
  
  SELECT COUNT(*) INTO v_total_referrals FROM profiles WHERE referred_by = v_user_id;
  
  SELECT COALESCE(SUM(COALESCE(fxu_amount, amount)), 0)
  INTO v_total_fxu
  FROM referral_commissions
  WHERE referrer_id = v_user_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', rc.id,
        'amount', COALESCE(rc.fxu_amount, rc.amount),
        'commission_type', 'fxu',
        'resource_type', 'fxu',
        'created_at', rc.created_at,
        'seller_username', p.username
      ) ORDER BY rc.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_recent_commissions
  FROM referral_commissions rc
  JOIN profiles p ON p.id = rc.seller_id
  WHERE rc.referrer_id = v_user_id
  LIMIT 20;

  RETURN jsonb_build_object(
    'success', true,
    'referral_code', v_referral_code,
    'total_referrals', v_total_referrals,
    'total_fxu', v_total_fxu,
    'recent_commissions', v_recent_commissions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_stats() TO authenticated;
