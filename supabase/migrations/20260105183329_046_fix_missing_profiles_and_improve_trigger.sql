/*
  # Fix Missing User Profiles and Improve Trigger

  1. Issue
    - Some users were registered but their profiles were not created
    - The trigger function was failing silently due to EXCEPTION handler

  2. Fix
    - Create profiles for all users who don't have one
    - Create planets for users who don't have any
    - Improve the trigger function to handle edge cases better

  3. Changes
    - Insert missing profiles
    - Insert missing planets and resources
    - Update handle_new_user function with better error handling
*/

-- First, create profiles for users who don't have them
DO $$
DECLARE
  v_user RECORD;
  v_username text;
  v_planet_id uuid;
  v_start_galaxy integer;
  v_start_system integer;
  v_start_position integer;
  v_attempts integer;
  v_position_found boolean;
BEGIN
  FOR v_user IN 
    SELECT u.id, u.email, u.raw_user_meta_data->>'username' as username_meta, u.created_at
    FROM auth.users u
    LEFT JOIN profiles p ON u.id = p.id
    WHERE p.id IS NULL
  LOOP
    -- Determine username
    v_username := COALESCE(v_user.username_meta, split_part(v_user.email, '@', 1));
    
    -- If username exists, append part of the id
    IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username) THEN
      v_username := v_username || '_' || substr(v_user.id::text, 1, 4);
    END IF;
    
    -- Insert profile
    INSERT INTO profiles (id, username, email, dark_matter, fxu_balance)
    VALUES (v_user.id, v_username, v_user.email, 0, 1000)
    ON CONFLICT (id) DO NOTHING;
    
    -- Check if user has a planet
    IF NOT EXISTS (SELECT 1 FROM planets WHERE user_id = v_user.id) THEN
      -- Find empty position
      v_attempts := 0;
      v_position_found := false;
      
      WHILE NOT v_position_found AND v_attempts < 100 LOOP
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
      
      -- Fallback if no position found
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
      
      -- Create planet
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
        v_user.id,
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
      
      RAISE NOTICE 'Created planet for user %', v_user.email;
    END IF;
    
    RAISE NOTICE 'Created profile for user %', v_user.email;
  END LOOP;
END $$;

-- Improve the handle_new_user function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
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
  
  -- Create profile (with all default values including fxu_balance)
  INSERT INTO profiles (id, username, email, dark_matter, fxu_balance)
  VALUES (NEW.id, v_username, NEW.email, 0, 1000);
  
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