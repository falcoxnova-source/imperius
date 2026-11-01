/*
  # Auto Setup New Users

  1. Purpose
    - Automatically create profile, planet, and resources when a new user signs up
    - This runs as a database trigger with elevated privileges, bypassing RLS

  2. Changes
    - Creates function `handle_new_user()` that:
      - Creates a profile record
      - Creates a main planet with random coordinates
      - Creates planet resources with starting values
    - Creates trigger on auth.users table to call function on INSERT

  3. Security
    - Function runs with SECURITY DEFINER to bypass RLS
    - Only triggered by auth system, not user input
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  new_planet_id uuid;
  random_galaxy int;
  random_system int;
  random_position int;
  username_val text;
BEGIN
  username_val := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  random_galaxy := floor(random() * 5 + 1)::int;
  random_system := floor(random() * 499 + 1)::int;
  random_position := floor(random() * 15 + 1)::int;

  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, username_val, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.planets (
    id, user_id, name, galaxy, solar_system, position,
    is_main_planet, diameter, fields_max, temp_min, temp_max
  )
  VALUES (
    gen_random_uuid(), NEW.id, 'Planeta Principal',
    random_galaxy, random_system, random_position,
    true, 12800, 163, -20, 40
  )
  RETURNING id INTO new_planet_id;

  IF new_planet_id IS NOT NULL THEN
    INSERT INTO public.planet_resources (
      planet_id, metal, crystal, deuterium,
      metal_per_hour, crystal_per_hour, deuterium_per_hour,
      metal_storage, crystal_storage, deuterium_storage
    )
    VALUES (
      new_planet_id, 500, 500, 0,
      30, 15, 0,
      10000, 10000, 10000
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
