/*
  # Fix Referral Code Application During Registration

  ## Problem
  - Referral codes were only applied AFTER registration via `set_user_referral` RPC
  - When email confirmation is required, users are not logged in after signup
  - This means `auth.uid()` is null and the referral code never gets applied

  ## Solution
  - Pass the referral code in user metadata during signup
  - Update the `handle_new_user` trigger to read the referral code from metadata
  - Apply the referral at profile creation time, before any email confirmation

  ## Changes
  1. Updated `handle_new_user` function to:
     - Read `referral_code` from `raw_user_meta_data`
     - Look up the referrer by their referral code
     - Set `referred_by` on the new profile

  ## Security
  - Validates that the referral code exists
  - Prevents self-referral
  - Maintains existing RLS policies
*/

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_username text;
  v_referral_code text;
  v_referred_by_code text;
  v_referrer_id uuid;
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

  -- Check if there's a referral code in metadata
  v_referred_by_code := UPPER(TRIM(COALESCE(NEW.raw_user_meta_data->>'referral_code', '')));
  
  IF v_referred_by_code IS NOT NULL AND v_referred_by_code <> '' THEN
    -- Look up the referrer by their referral code
    SELECT id INTO v_referrer_id 
    FROM profiles 
    WHERE referral_code = v_referred_by_code;
    
    -- Don't allow self-referral (shouldn't happen but be safe)
    IF v_referrer_id = NEW.id THEN
      v_referrer_id := NULL;
    END IF;
  END IF;

  -- Create profile with fxu_balance = 0 (tokens must be purchased)
  INSERT INTO profiles (id, username, email, dark_matter, fxu_balance, referral_code, referred_by)
  VALUES (NEW.id, v_username, NEW.email, 0, 0, v_referral_code, v_referrer_id);

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
$function$;
